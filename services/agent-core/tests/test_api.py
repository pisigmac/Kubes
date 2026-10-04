import pytest
import httpx
from main import app


@pytest.mark.asyncio
async def test_api_health_endpoint():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "kubes-agent-core"
        assert data["version"] == "0.1.0"


@pytest.mark.asyncio
async def test_api_status_endpoint():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "running"
        assert "kubemind" in data
        assert "mcp_tools" in data
        assert len(data["mcp_tools"]) >= 5


@pytest.mark.asyncio
async def test_api_mcp_tools_endpoint():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/mcp/tools")
        assert resp.status_code == 200
        data = resp.json()
        assert "tools" in data
        tool_names = [t["name"] for t in data["tools"]]
        assert "pdf_extract" in tool_names
        assert "data_analysis" in tool_names
        assert "web_extract" in tool_names
        assert "schedule_task" in tool_names
        assert "list_tasks" in tool_names


@pytest.mark.asyncio
async def test_api_chat_stream_endpoint():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/chat/stream",
            json={
                "messages": [{"role": "user", "content": "Help me plan my week"}],
                "cube_slug": "focus",
                "thread_id": "test-thread-1",
            },
        )
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")
        body = resp.text
        assert "data:" in body
        assert "text-delta" in body or "finish" in body
