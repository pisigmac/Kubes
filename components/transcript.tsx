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

export function Transcript({
  messages,
  cubes,
  activeName,
  onViewArtifact,
}: {
  messages: UIMessage[];
  cubes: Cube[];
  activeName: string;
  onViewArtifact?: (artifact: { name: string; path: string; content: string }) => void;
}) {
  if (messages.length === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-1 flex-col justify-end px-4 pb-8">
        <p className="text-sm uppercase tracking-[0.18em] text-white/40">Kubes</p>
        <h2 className="mt-3 text-3xl font-medium tracking-tight text-balance">
          {activeName === "Maestro" ? "What should happen next?" : `Talking with ${activeName}`}
        </h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-white/55">
          {activeName === "Maestro"
            ? "Maestro hands everyday messes to a specialist Cube. Ask about the next step, a bill, a hard email, or a form you keep avoiding."
            : "This Cube answers directly. Maestro is not in the room."}
        </p>
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
}: {
  message: UIMessage;
  cubes: Cube[];
  activeName: string;
  onViewArtifact?: (artifact: { name: string; path: string; content: string }) => void;
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

        if (name === "computer_write" && part.state === "output-available" && isRecord(part.input)) {
          const input = part.input as { path?: string; text?: string };
          const filePath = input.path || "file";
          const fileName = filePath.split("/").pop() || filePath;
          return (
            <div key={key} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onViewArtifact && input.text !== undefined) {
                    onViewArtifact({
                      name: fileName,
                      path: filePath,
                      content: input.text,
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

        if (name === "delete_task") {
          return (
            <p key={key} className="text-xs text-white/50">
              {part.state === "output-error" ? part.errorText : "Removed scheduled task."}
            </p>
          );
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
