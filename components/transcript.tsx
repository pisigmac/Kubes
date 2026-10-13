"use client";

import { isToolUIPart, type UIMessage } from "ai";
import { accentFor } from "@/components/cube-mark";
import { MarkdownView } from "@/components/markdown-view";
import type { Cube, CubeMutationResult, HandoffResult } from "@/lib/cubes/types";

function toolNameOf(part: { type: string; toolName?: string }) {
  if (part.type === "dynamic-tool" && part.toolName) return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.slice(5);
  return part.toolName ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function asHandoff(value: unknown): HandoffResult | undefined {
  if (!isRecord(value) || typeof value.reply !== "string" || typeof value.cubeName !== "string") {
    return undefined;
  }
  return value as HandoffResult;
}

function asMutation(value: unknown): CubeMutationResult | undefined {
  if (!isRecord(value) || typeof value.ok !== "boolean") return undefined;
  return value as CubeMutationResult;
}

const MAESTRO_STARTER_PILLS = [
  {
    icon: "⚡",
    title: "Berlin Relocation Plan",
    prompt:
      "Create a complete Berlin Relocation Plan: calculate estimated monthly costs, research top neighborhoods, and list required registration documents.",
  },
  {
    icon: "⚡",
    title: "Full Stack Tech Stack Decision",
    prompt:
      "Compare Next.js, Vite, and Remix for a modern dashboard app with SQLite and generate an architecture trade-off matrix.",
  },
  {
    icon: "⚡",
    title: "Monthly Financial Audit",
    prompt:
      "Conduct a monthly financial audit: analyze sample expense categories, outline cost savings, and generate a budget summary.",
  },
];

const SPECIALIST_STARTER_PILLS: Record<string, Array<{ icon: string; title: string; prompt: string }>> = {
  money: [
    {
      icon: "💰",
      title: "Review Recurring Subscriptions",
      prompt: "Help me review my monthly subscriptions, identify unused recurring charges, and suggest 3 areas to cut spending.",
    },
    {
      icon: "📊",
      title: "Analyze Expense CSV",
      prompt: "I have transactions to review. Create a categorized spending breakdown with total sums and budget alerts.",
    },
  ],
  "job-hunt": [
    {
      icon: "💼",
      title: "Track Senior Engineer Application",
      prompt: "Log an application for Senior Software Engineer at TechCorp and draft a tailored follow-up email template.",
    },
    {
      icon: "📝",
      title: "Resume Bullet Polish",
      prompt: "Help me rewrite 3 engineering resume bullet points using the Google X-Y-Z formula (Accomplished [X] measured by [Y] by doing [Z]).",
    },
  ],
  learn: [
    {
      icon: "📚",
      title: "Swarm Architecture Diagram",
      prompt: "Generate a Mermaid architecture diagram showing how Maestro orchestrates parallel specialist Kubes in a DAG.",
    },
    {
      icon: "🧠",
      title: "Tech Concept Deep Dive",
      prompt: "Explain SQLite WAL mode versus traditional rollback journal with concurrency benchmarks.",
    },
  ],
  work: [
    {
      icon: "🛠️",
      title: "Daily Standup Summary",
      prompt: "Draft a clear, concise daily standup update based on my recent notes and active git tasks.",
    },
  ],
};

export function Transcript({
  messages,
  cubes,
  activeName,
  onViewArtifact,
  onApproveAction,
  onDenyAction,
  providerReady,
  onOpenProviders,
  onSelectPrompt,
}: {
  messages: UIMessage[];
  cubes: Cube[];
  activeName: string;
  onViewArtifact?: (artifact: { name: string; path: string; content: string }) => void;
  onApproveAction?: (action: { type: "exec" | "write"; target: string }) => void;
  onDenyAction?: (action: { type: "exec" | "write"; target: string }) => void;
  providerReady?: boolean;
  onOpenProviders?: () => void;
  onSelectPrompt?: (prompt: string) => void;
}) {
  if (messages.length === 0) {
    const isMaestro = activeName === "Maestro";
    const slugKey = activeName.toLowerCase().replace(/\s+/g, "-");
    const pills = isMaestro
      ? MAESTRO_STARTER_PILLS
      : SPECIALIST_STARTER_PILLS[slugKey] || [
          {
            icon: "💬",
            title: `Ask ${activeName}`,
            prompt: `Hi ${activeName}, what specialist capabilities can you help me with today?`,
          },
        ];

    return (
      <div className="mx-auto flex max-w-xl flex-1 flex-col justify-end px-4 pb-8">
        <p className="text-sm uppercase tracking-[0.18em] text-white/40">Kubes</p>
        <h2 className="mt-3 text-3xl font-medium tracking-tight text-balance">
          {isMaestro ? "What should happen next?" : `Talking with ${activeName}`}
        </h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-white/55">
          {isMaestro
            ? "Maestro orchestrates everyday messes and autonomous multi-agent swarms. Give a composite goal, or pick a starter workflow below."
            : "This Cube answers directly. Maestro is not in the room."}
        </p>

        {/* Guided Onboarding for Fresh Installations */}
        {providerReady === false ? (
          <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 backdrop-blur-sm">
            <div className="flex items-center gap-2.5 text-sm font-medium text-amber-300">
              <span className="text-base">🔑</span>
              <span>Connect an AI Provider to Get Started</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-amber-200/80">
              Kubes runs locally with sandbox process isolation. Connect a free Google Gemini key (via Google AI Studio) or Groq key (via Groq Cloud LPU) to enable responses and multi-agent swarms.
            </p>
            {onOpenProviders ? (
              <button
                type="button"
                onClick={onOpenProviders}
                className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-amber-300"
              >
                <span>Configure Free Provider</span>
                <span>→</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Starter Composite Workflow Pills */}
        <div className="mt-6 space-y-2.5">
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">
            {isMaestro ? "Starter Composite Swarms" : "Suggested Actions"}
          </p>
          <div className="flex flex-wrap gap-2">
            {pills.map((pill) => (
              <button
                key={pill.title}
                type="button"
                onClick={() => onSelectPrompt?.(pill.prompt)}
                className="group flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs text-white/80 transition hover:border-[#e7ff3a]/40 hover:bg-white/[0.06] hover:text-white"
              >
                <span className="text-sm">{pill.icon}</span>
                <span className="font-medium">{pill.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      {messages.map((message) => (
        <Message
          key={message.id}
          message={message}
          cubes={cubes}
          activeName={activeName}
          onViewArtifact={onViewArtifact}
          onApproveAction={onApproveAction}
          onDenyAction={onDenyAction}
        />
      ))}
    </div>
  );
}

function Message({
  message,
  cubes,
  activeName,
  onViewArtifact,
  onApproveAction,
  onDenyAction,
}: {
  message: UIMessage;
  cubes: Cube[];
  activeName: string;
  onViewArtifact?: (artifact: { name: string; path: string; content: string }) => void;
  onApproveAction?: (action: { type: "exec" | "write"; target: string }) => void;
  onDenyAction?: (action: { type: "exec" | "write"; target: string }) => void;
}) {
  if (message.role === "user") {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    return (
      <div className="flex justify-end">
        <p className="max-w-[40rem] rounded-2xl bg-white/[0.06] px-4 py-3 text-[15px] leading-6 whitespace-pre-wrap">
          {text}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {message.parts.map((part, index) => {
        if (part.type === "text" && part.text) {
          return (
            <div key={`${message.id}-text-${index}`} className="max-w-[42rem]">
              <MarkdownView content={part.text} />
            </div>
          );
        }

        if (!isToolUIPart(part)) return null;
        const name = toolNameOf(part);
        const key = `${message.id}-${part.toolCallId}`;

        if (name === "list_cubes") {
          if (part.state === "output-error") {
            return (
              <p key={key} className="text-sm text-red-300">
                {part.errorText}
              </p>
            );
          }
          return null;
        }

        if (name === "handoff") {
          return <HandoffPart key={key} part={part} cubes={cubes} />;
        }

        if (name === "create_cube" || name === "update_cube") {
          return <MutationPart key={key} name={name} part={part} />;
        }

        if (name === "computer_write") {
          const output = part.state === "output-available" && isRecord(part.output) ? part.output : undefined;
          const input = isRecord(part.input) ? (part.input as { path?: string; text?: string }) : undefined;
          const filePath = (typeof output?.path === "string" ? output.path : input?.path) || "file";
          const fileName = filePath.split("/").pop() || filePath;
          const fileContent = typeof output?.text === "string" ? output.text : input?.text;
          const requiresApproval = Boolean(output?.requiresApproval);

          if (requiresApproval) {
            return (
              <div
                key={key}
                className="my-1.5 flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-950/20 p-3.5 text-xs shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium text-amber-300">
                    <span>🛡️</span>
                    <span>File Write Approval Required</span>
                  </div>
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] text-amber-200">
                    File Mutation
                  </span>
                </div>
                <p className="text-white/70">
                  {activeName} wants to write file: <code className="text-amber-200 font-mono">{filePath}</code>
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onApproveAction?.({ type: "write", target: filePath })}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 font-medium text-emerald-300 hover:bg-emerald-500/30 transition"
                  >
                    <span>✓</span> Approve & Save
                  </button>
                  <button
                    type="button"
                    onClick={() => onDenyAction?.({ type: "write", target: filePath })}
                    className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/15 px-3 py-1.5 text-white/70 hover:bg-white/10 hover:text-white transition"
                  >
                    <span>✕</span> Deny
                  </button>
                </div>
              </div>
            );
          }

          if (part.state === "output-available") {
            return (
              <div key={key} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (onViewArtifact && fileContent !== undefined) {
                      onViewArtifact({
                        name: fileName,
                        path: filePath,
                        content: fileContent,
                      });
                    }
                  }}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/80 transition-colors hover:border-[#e7ff3a]/40 hover:bg-white/[0.06] hover:text-white"
                >
                  <span className="inline-block h-2 w-2 rounded-full bg-[#e7ff3a]" />
                  <span>Created <strong>{fileName}</strong></span>
                  <span className="text-white/40">· Click to view artifact</span>
                </button>
              </div>
            );
          }
        }

        if (name === "schedule_task" || name === "update_task") {
          const output = part.state === "output-available" && isRecord(part.output) ? part.output : undefined;
          const summary = typeof output?.summary === "string" ? output.summary : "Configuring task schedule…";
          return (
            <div key={key} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs text-white/80">
              <svg className="h-4 w-4 shrink-0 text-[#e7ff3a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{part.state === "output-error" ? part.errorText : summary}</span>
            </div>
          );
        }

        if (name === "live_search") {
          const output = part.state === "output-available" && isRecord(part.output) ? part.output : undefined;
          const query = typeof output?.query === "string" ? output.query : (isRecord(part.input) && typeof part.input.query === "string" ? part.input.query : "");
          const results = Array.isArray(output?.results) ? (output.results as Array<{ title?: string; url?: string; snippet?: string; domain?: string }>) : [];
          const provider = typeof output?.provider === "string" ? output.provider : "web";

          return (
            <div key={key} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
              <div className="flex items-center justify-between text-white/70">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🔍</span>
                  <span className="font-medium text-white">Searched: &quot;{query}&quot;</span>
                </div>
                <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/50 uppercase">
                  {provider}
                </span>
              </div>
              {results.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-2">
                  {results.map((res, idx) => (
                    <a
                      key={res.url || idx}
                      href={res.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-[11px] text-white/80 transition hover:border-[#e7ff3a]/40 hover:bg-white/[0.06] hover:text-white"
                      title={res.snippet}
                    >
                      <span className="font-mono text-[10px] text-[#e7ff3a] font-semibold">[{idx + 1}]</span>
                      <span className="max-w-[200px] truncate font-medium">{res.title || res.domain}</span>
                      <span className="text-[10px] text-white/30 group-hover:text-white/60">↗</span>
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          );
        }

        if (name === "delete_task") {
          return (
            <p key={key} className="text-xs text-white/50">
              {part.state === "output-error" ? part.errorText : "Removed scheduled task."}
            </p>
          );
        }

        if (name === "computer_exec") {
          const output = part.state === "output-available" && isRecord(part.output) ? part.output : undefined;
          const input = isRecord(part.input) ? (part.input as { command?: string }) : undefined;
          const command = (typeof output?.command === "string" ? output.command : input?.command) || "";
          const requiresApproval = Boolean(output?.requiresApproval);

          if (requiresApproval) {
            return (
              <div
                key={key}
                className="my-1.5 flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-950/20 p-3.5 text-xs shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium text-amber-300">
                    <span>🛡️</span>
                    <span>Action Approval Required</span>
                  </div>
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] text-amber-200">
                    Terminal Command
                  </span>
                </div>
                <p className="text-white/70">
                  {activeName} wants to run this command on the shared computer:
                </p>
                <div className="rounded-lg border border-white/10 bg-black/60 p-2 font-mono text-[11px] text-amber-100 overflow-x-auto">
                  <code>$ {command}</code>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onApproveAction?.({ type: "exec", target: command })}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 font-medium text-emerald-300 hover:bg-emerald-500/30 transition"
                  >
                    <span>✓</span> Approve & Run
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      fetch("/api/safe-commands", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ command }),
                      }).catch(() => {});
                      onApproveAction?.({ type: "exec", target: command });
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1.5 text-xs text-emerald-300/80 hover:bg-emerald-500/20 hover:text-emerald-200 transition"
                    title="Persist this command so you are never prompted for it again"
                  >
                    <span>⚡</span> Always Allow
                  </button>
                  <button
                    type="button"
                    onClick={() => onDenyAction?.({ type: "exec", target: command })}
                    className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/15 px-3 py-1.5 text-white/70 hover:bg-white/10 hover:text-white transition"
                  >
                    <span>✕</span> Deny
                  </button>
                </div>
              </div>
            );
          }

          if (part.state === "output-available" && output) {
            const exitCode = typeof output.exitCode === "number" ? output.exitCode : 0;
            const stdout = typeof output.stdout === "string" ? output.stdout.trim() : "";
            const stderr = typeof output.stderr === "string" ? output.stderr.trim() : "";
            return (
              <div key={key} className="my-1 rounded-xl border border-white/10 bg-black/30 p-3 text-xs">
                <div className="flex items-center justify-between font-mono text-[11px] text-white/60">
                  <div className="flex items-center gap-2 truncate max-w-md">
                    <span className="text-[#e7ff3a]">⚡</span>
                    <span className="truncate">$ {command}</span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${
                      exitCode === 0
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-red-500/20 text-red-300"
                    }`}
                  >
                    exit {exitCode}
                  </span>
                </div>
                {stdout || stderr ? (
                  <pre className="mt-2 max-h-36 overflow-y-auto rounded-lg bg-black/50 p-2 font-mono text-[11px] text-white/70 whitespace-pre-wrap">
                    {stdout || stderr}
                  </pre>
                ) : null}
              </div>
            );
          }
        }

        if (name.startsWith("computer_")) {
          const output = part.state === "output-available" && isRecord(part.output) ? part.output : undefined;
          const summary = typeof output?.summary === "string" ? output.summary : "Using the computer";
          return (
            <p key={key} className="text-xs text-white/50">
              {part.state === "output-error" ? part.errorText : summary}
            </p>
          );
        }

        return (
          <p key={key} className="text-xs text-white/40">
            {activeName} used {name}
            {part.state === "output-error" ? `: ${part.errorText}` : ""}
          </p>
        );
      })}
    </div>
  );
}

function HandoffPart({
  part,
  cubes,
}: {
  part: {
    state: string;
    input?: unknown;
    output?: unknown;
    errorText?: string;
    preliminary?: boolean;
  };
  cubes: Cube[];
}) {
  const input = isRecord(part.input) ? part.input : undefined;
  const slug = typeof input?.slug === "string" ? input.slug : "";
  const known = cubes.find((cube) => cube.slug === slug);
  const output = part.state === "output-available" ? asHandoff(part.output) : undefined;
  const cubeName = output?.cubeName || known?.name || slug || "a Cube";
  const color = accentFor(output?.slug || slug || "focus");
  const pending = part.state === "input-streaming" || part.state === "input-available" || part.preliminary;

  if (part.state === "output-error") {
    return <p className="text-sm text-red-300">Handoff failed. {part.errorText}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm text-white/70">
        <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: color }} />
        <span>
          {pending && !output?.reply ? "Handing to" : "Handed to"} {cubeName}
        </span>
      </p>
      {output && !output.ok ? <p className="text-sm text-red-300">{output.error}</p> : null}
      {output?.activity?.map((line) => (
        <p key={line} className="text-xs text-white/50">
          {line}
        </p>
      ))}
      {output?.reply ? (
        <div className="max-w-[42rem] border-l-2 pl-4" style={{ borderColor: color }}>
          <p className="mb-1 text-xs tracking-wide text-white/45 uppercase">{cubeName}</p>
          <MarkdownView content={output.reply} />
        </div>
      ) : null}
    </div>
  );
}

function MutationPart({
  name,
  part,
}: {
  name: string;
  part: { state: string; output?: unknown; errorText?: string };
}) {
  if (part.state === "output-error") {
    return <p className="text-sm text-red-300">{part.errorText}</p>;
  }
  if (part.state !== "output-available") {
    return <p className="text-sm text-white/50">{name === "create_cube" ? "Creating a Cube…" : "Updating a Cube…"}</p>;
  }
  const output = asMutation(part.output);
  if (!output?.ok) {
    return <p className="text-sm text-red-300">{output?.error ?? "Could not change that Cube."}</p>;
  }
  const verb = name === "create_cube" ? "Created" : "Updated";
  return (
    <p className="text-sm text-white/70">
      {verb} {output.cube?.name}
    </p>
  );
}
