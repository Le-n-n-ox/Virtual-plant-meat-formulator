"""Shared request limits: Redis-backed behaviour (with a fake client) and memory fallback."""

import time

from app.core.limits import MemoryLimits, RedisLimits


class FakeRedis:
    """Just enough of the Redis API, shared by several RedisLimits instances."""

    def __init__(self) -> None:
        self.data: dict[str, int | str] = {}
        self.ttl: dict[str, int] = {}

    def incr(self, key: str) -> int:
        self.data[key] = int(self.data.get(key, 0)) + 1
        return int(self.data[key])

    def decr(self, key: str) -> int:
        self.data[key] = int(self.data.get(key, 0)) - 1
        return int(self.data[key])

    def expire(self, key: str, seconds: int) -> bool:
        self.ttl[key] = seconds
        return True

    def set(self, key, value, nx=False, ex=None):  # type: ignore[no-untyped-def]
        if nx and key in self.data:
            return None
        self.data[key] = value
        if ex is not None:
            self.ttl[key] = ex
        return True


class BrokenRedis:
    def __getattr__(self, name):  # type: ignore[no-untyped-def]
        def fail(*_args, **_kwargs):  # type: ignore[no-untyped-def]
            raise ConnectionError("redis down")

        return fail


def test_rate_limit_is_shared_between_processes() -> None:
    redis = FakeRedis()
    process_a, process_b = RedisLimits(redis), RedisLimits(redis)
    results = [(process_a if i % 2 == 0 else process_b).allow("login:abc", 3, 60) for i in range(5)]
    assert results == [True, True, True, False, False]  # 3 allowed in total, not 3 each
    assert process_a.allow("login:other", 3, 60) is True  # keys are independent
    assert all(ttl > 0 for ttl in redis.ttl.values())  # buckets always expire


def test_nonce_is_single_use_across_processes() -> None:
    redis = FakeRedis()
    process_a, process_b = RedisLimits(redis), RedisLimits(redis)
    expires = int(time.time()) + 60
    assert process_a.consume_nonce("n1", expires) is True
    assert process_b.consume_nonce("n1", expires) is False  # replay on another process
    assert process_b.consume_nonce("n2", expires) is True


def test_stream_slots_are_capped_across_processes_and_released() -> None:
    redis = FakeRedis()
    process_a, process_b = RedisLimits(redis), RedisLimits(redis)
    assert process_a.acquire_stream("u1", 2) and process_b.acquire_stream("u1", 2)
    assert process_a.acquire_stream("u1", 2) is False  # third stream refused
    assert process_b.acquire_stream("u2", 2) is True  # other users unaffected
    process_b.release_stream("u1")
    assert process_a.acquire_stream("u1", 2) is True
    for _ in range(5):  # extra releases never drive the count negative
        process_a.release_stream("u1")
    assert int(redis.data["vpmf:limits:streams:u1"]) == 0
    assert process_a.acquire_stream("u1", 1) is True


def test_redis_outage_falls_back_to_memory_instead_of_failing() -> None:
    limits = RedisLimits(BrokenRedis())
    limits.reset()
    assert [limits.allow("k-outage", 2, 60) for _ in range(3)] == [True, True, False]
    expires = int(time.time()) + 60
    assert limits.consume_nonce("outage-nonce", expires) is True
    assert limits.consume_nonce("outage-nonce", expires) is False
    assert limits.acquire_stream("outage-user", 1) is True
    assert limits.acquire_stream("outage-user", 1) is False
    limits.release_stream("outage-user")
    assert limits.acquire_stream("outage-user", 1) is True
    limits.release_stream("outage-user")


def test_memory_limits_behave_the_same() -> None:
    limits = MemoryLimits()
    limits.reset()
    assert [limits.allow("k-memory", 2, 60) for _ in range(3)] == [True, True, False]
    expires = int(time.time()) + 60
    assert limits.consume_nonce("memory-nonce", expires) is True
    assert limits.consume_nonce("memory-nonce", expires) is False
