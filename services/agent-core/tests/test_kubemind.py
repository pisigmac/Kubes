import pytest
from kubemind_adapter import KubeMindAdapter, MemoryQueryResult


@pytest.mark.asyncio
async def test_kubemind_adapter_defaults():
    adapter = KubeMindAdapter(gateway_url="http://localhost:9080", api_key="km_test")
    assert adapter.gateway_url == "http://localhost:9080"
    assert adapter.api_key == "km_test"
    assert adapter.is_enabled is False


@pytest.mark.asyncio
async def test_kubemind_adapter_disabled_memory_fallback():
    adapter = KubeMindAdapter()
    res = await adapter.query_memory("focus", "query text")
    assert isinstance(res, MemoryQueryResult)
    assert res.query == "query text"
    assert res.memories == []
    assert res.relevance_scores == []


@pytest.mark.asyncio
async def test_kubemind_adapter_disabled_audit_span_fallback():
    adapter = KubeMindAdapter()
    emitted = await adapter.emit_audit_span(
        cube_slug="focus",
        action="execute_plan",
        input_data={"goal": "test"},
        output_data={"result": "ok"},
    )
    assert emitted is True
