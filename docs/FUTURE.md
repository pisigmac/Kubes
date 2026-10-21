# Product Roadmap & Future Architecture

## Q4 2026: Multi-Agent Swarms & Real-Time Voice
- [ ] **Voice-Driven Maestro**: WebRTC duplex streaming for conversational agent direction.
- [ ] **Dynamic Sub-Agent Spawning**: Specialists can autonomously spawn ephemeral sub-cubes for parallel task fan-out.

Hybrid memory retrieval through the optional `kubemind` companion is implemented in `lib/memory/kubemind.ts` and `lib/memory/store.ts`, with SQLite lexical fallback when the companion is unavailable. It is not roadmap work; companion deployment and runtime health are separate operational concerns.

## Q1 2027: Enterprise Governance & SOC2
- [ ] **Immutable Audit Log Streaming**: Forward all command execution and LLM prompt tokens to external SIEMs (Datadog, Splunk).
- [ ] **Granular Data Loss Prevention (DLP)**: Automated regex scanning of agent outputs to prevent PII and credential exposure.
- [ ] **Self-Hosted Kubernetes Helm Charts**: Turnkey cloud deployment with automated cert-manager and horizontal pod autoscalers.
