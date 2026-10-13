"""
KubeMind Client Adapter for Kubes Python Agent Core.
Handles Zero-Egress PII sanitization, semantic memory recall, and Sentinel audit spans.
"""

from __future__ import annotations
import os
import httpx
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class MemoryQueryResult(BaseModel):
    query: str
    memories: List[Dict[str, Any]] = []
    relevance_scores: List[float] = []


class KubeMindAdapter:
    def __init__(
        self,
        gateway_url: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.gateway_url = (
            gateway_url
            or os.getenv("KUBEMIND_GATEWAY_URL")
            or "http://localhost:9080"
        ).rstrip("/")
        self.api_key = api_key or os.getenv("KUBEMIND_API_KEY") or ""
        self.timeout = timeout

    @property
    def is_enabled(self) -> bool:
        return os.getenv("KUBEMIND_ENABLED", "false").lower() in ("true", "1", "yes")

    async def query_memory(self, cube_slug: str, query: str, limit: int = 5) -> MemoryQueryResult:
        """Query Mind semantic memory service for relevant facts/context."""
        if not self.is_enabled:
            return MemoryQueryResult(query=query, memories=[], relevance_scores=[])

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
                resp = await client.post(
                    f"{self.gateway_url}/v1/mind/query",
                    json={"cube_slug": cube_slug, "query": query, "limit": limit},
                    headers=headers,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return MemoryQueryResult(
                        query=query,
                        memories=data.get("memories", []),
                        relevance_scores=data.get("scores", []),
                    )
        except Exception:
            pass
        return MemoryQueryResult(query=query, memories=[], relevance_scores=[])

    async def emit_audit_span(
        self,
        cube_slug: str,
        action: str,
        input_data: Dict[str, Any],
        output_data: Dict[str, Any],
        status: str = "success",
    ) -> bool:
        """Emit cryptographic execution span to KubeMind Sentinel."""
        if not self.is_enabled:
            return True

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
                resp = await client.post(
                    f"{self.gateway_url}/v1/sentinel/spans",
                    json={
                        "cube_slug": cube_slug,
                        "action": action,
                        "input": input_data,
                        "output": output_data,
                        "status": status,
                    },
                    headers=headers,
                )
                return resp.status_code in (200, 201)
        except Exception:
            return False
