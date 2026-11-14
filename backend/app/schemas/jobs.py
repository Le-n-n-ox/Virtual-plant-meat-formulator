"""Job request schemas. Type-specific params are validated in the jobs service."""

from typing import Any, Literal

from pydantic import BaseModel, Field

JobTypeLiteral = Literal["nutrition", "texture_prediction", "optimization"]


class JobCreate(BaseModel):
    type: JobTypeLiteral
    version: int | None = Field(default=None, ge=1)
    params: dict[str, Any] | None = None


class TrainRequest(BaseModel):
    target: str = "hardness"
    seed: int | None = None
    dataset: Literal["foodml2023_hme"] = "foodml2023_hme"
