"""Evidence explainer backed by an NVIDIA-hosted OpenAI-compatible chat model.

The model only narrates stored results. It never produces texture or nutrient values; the
reply is post-checked and any number not present in the supplied context is flagged.
"""

import json
import logging
import re
from datetime import UTC, datetime
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

DISCLAIMER = (
    "AI-generated explanation of stored results. It is not a measurement or a prediction, "
    "and texture estimates remain literature-derived and not locally validated."
)

SYSTEM_PROMPT = (
    "You explain stored results of a plant-based meat formulation tool to a {audience}. "
    "Use ONLY the JSON context supplied by the user (stored results, model metadata, "
    "evidence, warnings). Never invent numbers. Never predict, estimate or compute "
    "texture, nutrient or cost values yourself; quote values exactly as given. "
    "State uncertainty, prediction intervals and any out-of-domain or missing-feature "
    "warnings prominently, and say that texture values are literature-derived estimates "
    "not validated on local formulations. If the context does not contain the answer, say "
    "so. Say 'AAS' (amino acid score), never DIAAS. Be concise."
)

_NUMBER = re.compile(r"(?<![\w.])-?\d+(?:\.\d+)?")
_ID = re.compile(r"\b[a-z]{2,5}_[0-9A-Za-z]{8,}\b")
_LIST_MARKER = re.compile(r"(?m)^\s*\d+[.)]\s")
_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
MAX_CONTEXT_CHARS = 30000


class LlmUnavailable(Exception):
    """The language model is not configured or could not be reached."""


def strip_reasoning(text: str) -> str:
    text = _THINK.sub("", text)
    if "</think>" in text.lower():  # template emitted only the closing tag
        text = re.split(r"</think>", text, flags=re.IGNORECASE)[-1]
    if "<think>" in text.lower():  # unterminated reasoning: drop it
        text = re.split(r"<think>", text, flags=re.IGNORECASE)[0]
    return text.strip()


def _numbers_in(text: str) -> list[float]:
    text = _ID.sub(" ", text)
    return [float(m) for m in _NUMBER.findall(text)]


def _context_numbers(node: Any, out: set[float]) -> None:
    if isinstance(node, bool) or node is None:
        return
    if isinstance(node, int | float):
        out.add(float(node))
    elif isinstance(node, str):
        out.update(_numbers_in(node))
    elif isinstance(node, dict):
        for k, v in node.items():
            _context_numbers(k, out)
            _context_numbers(v, out)
    elif isinstance(node, list | tuple):
        for v in node:
            _context_numbers(v, out)


def check_numbers(reply: str, context: Any, extra_text: str = "") -> dict[str, Any]:
    known: set[float] = set()
    _context_numbers(context, known)
    known.update(_numbers_in(extra_text))
    known.update({k * 100 for k in list(known)})  # 0.9 interval level quoted as 90%
    cleaned = _LIST_MARKER.sub(" ", _ID.sub(" ", reply))
    unverified: list[str] = []
    for raw in _NUMBER.findall(cleaned):
        decimals = len(raw.split(".")[1]) if "." in raw else 0
        value = float(raw)
        tol = 0.5 * 10 ** (-decimals) + 1e-9
        if not any(abs(value - k) <= tol for k in known) and raw not in unverified:
            unverified.append(raw)
    return {"unverified_numbers": unverified, "passed": not unverified}


class EvidenceExplainer:
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None) -> None:
        self.settings = settings
        self._transport = transport

    @property
    def configured(self) -> bool:
        return self.settings.nvidia_configured

    def _complete(self, messages: list[dict[str, str]], max_tokens: int) -> str:
        s = self.settings
        body = {
            "model": s.nvidia_model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": max_tokens,
        }
        url = s.nvidia_base_url.rstrip("/") + "/chat/completions"
        try:
            with httpx.Client(timeout=s.nvidia_timeout_seconds, transport=self._transport) as http:
                response = http.post(
                    url,
                    json=body,
                    headers={"Authorization": f"Bearer {s.nvidia_api_key}"},
                )
                response.raise_for_status()
                data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            # Log the exception type only: messages could echo request details.
            logger.warning("NVIDIA LLM request failed: %s", type(exc).__name__)
            raise LlmUnavailable("The language model request failed.") from exc
        try:
            message = data["choices"][0]["message"]
            content = message.get("content") or ""
        except (KeyError, IndexError, TypeError, AttributeError) as exc:
            raise LlmUnavailable("The language model returned an unexpected response.") from exc
        return strip_reasoning(content)  # reasoning_content is never read

    def explain(
        self,
        context: dict[str, Any],
        question: str | None = None,
        *,
        audience: str = "food scientist",
    ) -> dict[str, Any]:
        s = self.settings
        if not s.nvidia_configured:
            raise LlmUnavailable("The language model is not configured.")
        context_json = json.dumps(context, default=str, ensure_ascii=False)
        if len(context_json) > MAX_CONTEXT_CHARS:
            context_json = context_json[:MAX_CONTEXT_CHARS] + " ...[context truncated]"
        ask = question or "Summarize this result, its uncertainty and its limitations."
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT.format(audience=audience)},
            {"role": "user", "content": f"Context (JSON):\n{context_json}\n\nQuestion: {ask}"},
        ]
        # Reasoning models can spend the whole budget thinking; retry once with more room.
        text = ""
        for budget in (s.nvidia_max_tokens, s.nvidia_max_tokens * 3):
            text = self._complete(messages, budget)
            if text:
                break
        if not text:
            raise LlmUnavailable("The language model returned no answer text.")
        return {
            "text": text,
            "model": s.nvidia_model,
            "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "disclaimer": DISCLAIMER,
            "numbers_check": check_numbers(text, context, ask),
        }
