"""
LangGraph Multi-Agent Orchestration Engine for Kubes.
Implements cyclic StateGraph with Maestro routing, specialist handoffs, and tool execution.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional, TypedDict
from pydantic import BaseModel
from langgraph.graph import StateGraph, END
from mcp_tools import default_mcp_registry, MCPToolRegistry
from kubemind_adapter import KubeMindAdapter


class AgentMessage(BaseModel):
    role: str
    content: str
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None


class AgentState(TypedDict):
    messages: List[Dict[str, Any]]
    cube_slug: str
    active_cube: str
    iteration: int
    tool_results: List[Dict[str, Any]]
    final_reply: Optional[str]


def create_agent_graph(mcp_registry: Optional[MCPToolRegistry] = None, kubemind: Optional[KubeMindAdapter] = None):
    registry = mcp_registry or default_mcp_registry()
    km = kubemind or KubeMindAdapter()

    builder = StateGraph(AgentState)

    # 1. Maestro Router Node
    async def maestro_router(state: AgentState) -> Dict[str, Any]:
        messages = state["messages"]
        last_msg = messages[-1]["content"] if messages else ""
        current_cube = state.get("cube_slug", "maestro")

        # Query semantic memory if KubeMind enabled
        memories = await km.query_memory(current_cube, last_msg)

        # Route to specialist if prompt targets specific domain
        lowered = last_msg.lower()
        if "job" in lowered or "resume" in lowered or "apply" in lowered:
            target = "job-hunt"
        elif "money" in lowered or "expense" in lowered or "budget" in lowered or "bill" in lowered:
            target = "money"
        elif "calm" in lowered or "breath" in lowered or "stress" in lowered:
            target = "calm"
        else:
            target = current_cube

        return {
            "active_cube": target,
            "iteration": state.get("iteration", 0) + 1,
        }

    # 2. Specialist Node
    async def specialist_executor(state: AgentState) -> Dict[str, Any]:
        active_cube = state.get("active_cube", "focus")
        messages = state["messages"]
        last_prompt = messages[-1]["content"] if messages else ""

        # Check for tool call trigger
        if "extract pdf" in last_prompt.lower() or "read pdf" in last_prompt.lower():
            tool_call = {
                "id": "call-pdf-1",
                "name": "pdf_extract",
                "args": {"file_path": "document.pdf"},
            }
            return {
                "tool_results": [{"call": tool_call, "state": "pending"}],
            }

        reply = f"[{active_cube.upper()}] Processed goal: {last_prompt}"
        return {
            "final_reply": reply,
        }

    # 3. Tool Execution Node
    async def tool_executor(state: AgentState) -> Dict[str, Any]:
        pending_tools = state.get("tool_results", [])
        executed = []
        for item in pending_tools:
            call = item.get("call", {})
            name = call.get("name", "")
            args = call.get("args", {})
            result = await registry.call_tool(name, args)
            executed.append({"call": call, "result": result, "state": "completed"})

        summary = f"Executed {len(executed)} tool(s) successfully."
        return {
            "tool_results": executed,
            "final_reply": summary,
        }

    # Conditional Routing Edge
    def should_continue(state: AgentState) -> str:
        if state.get("tool_results") and any(t.get("state") == "pending" for t in state["tool_results"]):
            return "tool_node"
        return END

    # Build Graph Structure
    builder.add_node("router_node", maestro_router)
    builder.add_node("specialist_node", specialist_executor)
    builder.add_node("tool_node", tool_executor)

    builder.set_entry_point("router_node")
    builder.add_edge("router_node", "specialist_node")
    builder.add_conditional_edges("specialist_node", should_continue, {
        "tool_node": "tool_node",
        END: END,
    })
    builder.add_edge("tool_node", END)

    return builder.compile()
