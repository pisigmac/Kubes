import pytest
import pytest_asyncio
from graph import create_agent_graph
from mcp_tools import default_mcp_registry
from kubemind_adapter import KubeMindAdapter


@pytest.mark.asyncio
async def test_maestro_routes_to_job_hunt_specialist():
    graph = create_agent_graph()
    state = {
        "messages": [{"role": "user", "content": "Help me update my resume and apply for senior roles"}],
        "cube_slug": "maestro",
        "active_cube": "maestro",
        "iteration": 0,
        "tool_results": [],
        "final_reply": None,
    }

    result = await graph.ainvoke(state)
    assert result["active_cube"] == "job-hunt"
    assert "JOB-HUNT" in result["final_reply"]


@pytest.mark.asyncio
async def test_mcp_tool_execution_in_graph():
    graph = create_agent_graph()
    state = {
        "messages": [{"role": "user", "content": "Please extract PDF document.pdf"}],
        "cube_slug": "work",
        "active_cube": "work",
        "iteration": 0,
        "tool_results": [],
        "final_reply": None,
    }

    result = await graph.ainvoke(state)
    assert len(result["tool_results"]) > 0
    assert result["tool_results"][0]["call"]["name"] == "pdf_extract"
    assert result["tool_results"][0]["state"] == "completed"


@pytest.mark.asyncio
async def test_kubemind_adapter_fallback():
    adapter = KubeMindAdapter(gateway_url="http://localhost:9999")
    # In disabled mode it returns safe empty defaults
    assert adapter.is_enabled is False
    memories = await adapter.query_memory("focus", "test query")
    assert memories.memories == []


@pytest.mark.asyncio
async def test_mcp_schedule_and_list_tasks():
    registry = default_mcp_registry()
    tools = {t.name: t for t in registry.list_tools()}
    assert "schedule_task" in tools
    assert "list_tasks" in tools

    # 1. Schedule a task
    sched_res = await registry.call_tool(
        "schedule_task",
        {"cube_slug": "focus", "cron": "0 8 * * 1-5", "instruction": "Plan daily focus priorities"},
    )
    assert sched_res["ok"] is True
    assert sched_res["output"]["status"] == "scheduled"
    assert sched_res["output"]["cube_slug"] == "focus"
    assert sched_res["output"]["cron"] == "0 8 * * 1-5"

    # 2. List tasks
    list_res = await registry.call_tool("list_tasks", {"cube_slug": "focus"})
    assert list_res["ok"] is True
    assert len(list_res["output"]["tasks"]) > 0
    assert list_res["output"]["tasks"][0]["enabled"] is True


@pytest.mark.asyncio
async def test_maestro_routes_to_money_specialist():
    graph = create_agent_graph()
    state = {
        "messages": [{"role": "user", "content": "Review my monthly budget and expense breakdown"}],
        "cube_slug": "maestro",
        "active_cube": "maestro",
        "iteration": 0,
        "tool_results": [],
        "final_reply": None,
    }

    result = await graph.ainvoke(state)
    assert result["active_cube"] == "money"
    assert "MONEY" in result["final_reply"]


@pytest.mark.asyncio
async def test_maestro_routes_to_calm_specialist():
    graph = create_agent_graph()
    state = {
        "messages": [{"role": "user", "content": "I am feeling high stress and need help to breathe and reset"}],
        "cube_slug": "maestro",
        "active_cube": "maestro",
        "iteration": 0,
        "tool_results": [],
        "final_reply": None,
    }

    result = await graph.ainvoke(state)
    assert result["active_cube"] == "calm"
    assert "CALM" in result["final_reply"]


