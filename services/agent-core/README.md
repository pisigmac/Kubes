# Kubes Agent Core (Python LangGraph Service)

High-performance asynchronous multi-agent core for Kubes powered by LangGraph, FastAPI, and KubeMind governance adapters.

## Features
- **LangGraph Multi-Agent State Engine:** Cyclic state transitions, checkpointing, and agent-to-agent delegation.
- **FastAPI SSE Streaming:** Server-Sent Events delivering streaming tokens and tool status directly to Next.js.
- **MCP Python Tool Hub:** Standard Model Context Protocol (MCP) server exposing data science, PDF parsing, and web extraction tools.
- **KubeMind Governance Adapter:** Zero-egress PII sanitization and semantic memory hooks.

## Quick Start
```bash
cd services/agent-core
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
