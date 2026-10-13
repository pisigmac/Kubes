# Kubes Feature Catalog & Capabilities

## Core Features

1. **Autonomous Specialist Pods (Cubes)**:
   - Configurable personas, instructions, and target pain points.
   - Dynamic model assignment per specialist (GPT-4o, Claude 3.7 Sonnet, Gemini 2.0 Flash, DeepSeek-R1, Llama 3.3).
2. **Interactive Artifact Canvas**:
   - Live rendering for Markdown, Mermaid sequence/flowchart diagrams, and downloadable source code.
3. **Autonomous Task Scheduling Engine**:
   - Standard 5-field cron parsing with minimum 5-minute safety threshold.
   - Execution state tracking (`ok`, `error`, `running`).
4. **Executive Digest Notification System**:
   - Structured outcomes, desktop notifications (`notify-send`, AppleScript, PowerShell), Slack/Discord webhooks, and daily markdown logs.
5. **Computer Tooling & Sandboxed Execution**:
   - Exclusive lock seat execution, Linux Bubblewrap jail isolation, live URL security asserts, and screenshot streaming.
