import pytest
from mcp_tools import default_mcp_registry


@pytest.mark.asyncio
async def test_mcp_pdf_extract_tool():
    registry = default_mcp_registry()
    res = await registry.call_tool("pdf_extract", {"file_path": "research/report.pdf", "max_pages": 5})
    assert res["ok"] is True
    assert "text" in res["output"]
    assert res["output"]["file_path"] == "research/report.pdf"
    assert res["output"]["page_count"] == 1


@pytest.mark.asyncio
async def test_mcp_data_analysis_tool():
    registry = default_mcp_registry()
    # Test with string JSON
    res = await registry.call_tool(
        "data_analysis",
        {"data": '[{"id": 1, "val": 10}, {"id": 2, "val": 20}]', "operation": "describe"},
    )
    assert res["ok"] is True
    assert res["output"]["record_count"] == 2
    assert res["output"]["operation"] == "describe"

    # Test with raw list
    res2 = await registry.call_tool(
        "data_analysis",
        {"data": [{"a": 1}, {"a": 2}, {"a": 3}], "operation": "sum"},
    )
    assert res2["ok"] is True
    assert res2["output"]["record_count"] == 3


@pytest.mark.asyncio
async def test_mcp_web_extract_tool():
    registry = default_mcp_registry()
    res = await registry.call_tool("web_extract", {"url": "https://example.com/article"})
    assert res["ok"] is True
    assert "https://example.com/article" in res["output"]["url"]
    assert "content" in res["output"]
    assert res["output"]["word_count"] > 0


@pytest.mark.asyncio
async def test_mcp_unknown_tool_returns_error():
    registry = default_mcp_registry()
    res = await registry.call_tool("non_existent_tool", {})
    assert res["ok"] is False
    assert "not found" in res["error"]
