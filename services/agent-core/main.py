"""
Kubes Python Agent Core - FastAPI Entrypoint.
Provides REST and SSE endpoints for LangGraph agent execution and MCP tool dispatching.
"""

from __future__ import annotations
import asyncio
import json
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from graph import create_agent_graph
from mcp_tools import default_mcp_registry
from kubemind_adapter import KubeMindAdapter

app = FastAPI(
    title="Kubes Agent Core",
    version="0.1.0",
    description="Asynchronous LangGraph Multi-Agent Runtime with MCP and KubeMind Adapters",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mcp_registry = default_mcp_registry()
kubemind_adapter = KubeMindAdapter()
agent_graph = create_agent_graph(mcp_registry=mcp_registry, kubemind=kubemind_adapter)


class ChatRequest(BaseModel):
    messages: List[Dict[str, Any]]
    cube_slug: Optional[str] = "maestro"
    thread_id: Optional[str] = "default"


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "kubes-agent-core",
        "version": "0.1.0",
    }


@app.get("/api/v1/status")
async def runtime_status():
    return {
        "status": "running",
        "kubemind": {
            "enabled": kubemind_adapter.is_enabled,
            "gateway": kubemind_adapter.gateway_url,
        },
        "mcp_tools": [tool.name for tool in mcp_registry.list_tools()],
        "graph_nodes": ["router_node", "specialist_node", "tool_node"],
    }


@app.get("/api/v1/mcp/tools")
async def list_mcp_tools():
    return {"tools": mcp_registry.list_tools()}


@app.post("/api/v1/chat/stream")
async def chat_stream(request: ChatRequest):
    """Stream LangGraph execution progress via Server-Sent Events (SSE)."""

    async def event_generator():
        initial_state = {
            "messages": request.messages,
            "cube_slug": request.cube_slug or "maestro",
            "active_cube": request.cube_slug or "maestro",
            "iteration": 0,
            "tool_results": [],
            "final_reply": None,
        }

        # Emit routing start event
        yield {
            "event": "message",
            "data": json.dumps({
                "type": "status",
                "status": "routing",
                "cube": request.cube_slug,
            }),
        }

        try:
            result = await agent_graph.ainvoke(initial_state)
            reply = result.get("final_reply") or "Task completed."
            active_cube = result.get("active_cube", request.cube_slug)

            # Stream tokens
            words = reply.split(" ")
            for i, word in enumerate(words):
                token = word + (" " if i < len(words) - 1 else "")
                yield {
                    "event": "message",
                    "data": json.dumps({
                        "type": "text-delta",
                        "text": token,
                        "cube": active_cube,
                    }),
                }
                await asyncio.sleep(0.01)

            # Emit final completion
            yield {
                "event": "message",
                "data": json.dumps({
                    "type": "finish",
                    "cube": active_cube,
                    "tools_used": len(result.get("tool_results", [])),
                }),
            }
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}),
            }

    return EventSourceResponse(event_generator())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
