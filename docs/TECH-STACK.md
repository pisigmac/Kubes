# Technology Stack & Architectural Decisions

## Core Frameworks & Runtimes

| Layer | Technology | Version / Spec | Rationale |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | Next.js App Router | `16.3.8` | Server components, streaming responses, unified API routing |
| **UI Library** | React | `19.2.8` | Latest concurrent features, optimized client rendering |
| **Styling** | Tailwind CSS | `4.3.3` | Modern CSS engine, zero-runtime styling, atomic utilities |
| **Runtime (Node)** | Node.js | `>=20.19.0` (v22 tested) | Native ESM, `--experimental-strip-types`, fast built-in test runner |
| **Runtime (Python)** | Python + uv | `3.10+` / `uv 0.7.8` | High-performance Python package management & agent runtime |
| **Database** | SQLite + `better-sqlite3` | `13.0.3` | WAL mode, sub-millisecond query performance, zero operational overhead |
| **Identity & Security** | `jose` (JWT / JWKS) | `6.2.12` | Standards-compliant cryptographic verification (RS256, ES256, EdDSA) |
| **Browser Automation** | Puppeteer Core | `25.12.0` | Headless Chromium automation with request interception & screenshotting |
| **Sandboxing Engine** | Bubblewrap (`bwrap`) | `0.6.1+` | Unprivileged Linux namespace isolation for untrusted bash execution |
| **Package Manager** | `pnpm` | `11.17.0` | Fast, deterministic, content-addressable disk storage |

---

## AI SDK & Inference Layer

- **Vercel AI SDK (`ai` v7, `@ai-sdk/openai`, `@ai-sdk/react`)**: Provides standard streaming abstractions, multi-step tool calls, structured object parsing, and unified model routing.
- **Provider Support**: Direct integration with OpenAI, OpenRouter, Anthropic, Google Gemini, Ollama, and local custom endpoints.
