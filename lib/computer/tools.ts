import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { browse, clickPage, typePage } from "@/lib/computer/browser";
import {
  ensureWorkspace,
  execCommand,
  listTree,
  readRootFor,
  readText,
  resolveInside,
  writeText,
} from "@/lib/computer/jail";

type Actor = { slug: string; name: string; isMaestro: boolean };

function failed(error: unknown): { ok: false; summary: string } {
  const summary = error instanceof Error ? error.message : "The computer could not do that.";
  return { ok: false, summary };
}

export function computerTools(actor: Actor) {
  const own = () => ensureWorkspace(actor.slug, actor.isMaestro);
  return {
    computer_exec: tool({
      description: "Run one shell command in this Cube's directory on the shared computer.",
      inputSchema: z.object({ command: z.string() }),
      execute: async ({ command }) => {
        try {
          const result = await execCommand(actor.slug, actor.isMaestro, actor.name, command);
          const summary = `Ran \`${command.slice(0, 80)}\` (${result.exitCode ?? "stopped"})`;
          return { ok: result.exitCode === 0, summary, ...result };
        } catch (error) {
          return failed(error);
        }
      },
    }),
    computer_list: tool({
      description: actor.isMaestro
        ? "List files. Pass a Cube slug to read that Cube's directory. Omit it to list your own."
        : "List files in this Cube's directory.",
      inputSchema: z.object({
        cube: z.string().optional(),
        path: z.string().optional(),
      }),
      execute: async ({ cube, path }) => {
        try {
          const root = readRootFor(actor, (cube || actor.slug).trim() || actor.slug);
          const start = path ? resolveInside(root, path) : root;
          const entries = listTree(start);
          return { ok: true, summary: `Listed ${path || cube || actor.slug}`, entries };
        } catch (error) {
          return failed(error);
        }
      },
    }),
    computer_read: tool({
      description: actor.isMaestro
        ? "Read a text file. Pass a Cube slug to read that Cube's file. You cannot write it."
        : "Read a text file in this Cube's directory.",
      inputSchema: z.object({
        path: z.string(),
        cube: z.string().optional(),
      }),
      execute: async ({ path, cube }) => {
        try {
          const root = readRootFor(actor, (cube || actor.slug).trim() || actor.slug);
          const file = readText(root, path);
          return {
            ok: true,
            summary: `Read ${path}`,
            text: file.text,
            truncated: file.truncated,
          };
        } catch (error) {
          return failed(error);
        }
      },
    }),
    computer_write: tool({
      description: "Write a text file in this Cube's own directory. Creates folders. Cannot write another Cube's files.",
      inputSchema: z.object({ path: z.string(), text: z.string() }),
      execute: async ({ path, text }) => {
        try {
          const saved = writeText(own(), path, text);
          return { ok: true, summary: `Wrote ${saved}`, path: saved };
        } catch (error) {
          return failed(error);
        }
      },
    }),
    computer_browse: tool({
      description: "Open an http or https page on the shared computer and read what is visible.",
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => {
        try {
          const page = await browse(actor.name, url);
          return { ok: true, summary: `Opened ${page.url}`, ...page };
        } catch (error) {
          return failed(error);
        }
      },
    }),
    computer_click: tool({
      description: "Click a button or link on the open page by its visible text or a CSS selector.",
      inputSchema: z.object({ target: z.string() }),
      execute: async ({ target }) => {
        try {
          const url = await clickPage(actor.name, target);
          return { ok: true, summary: `Clicked ${target}`, url };
        } catch (error) {
          return failed(error);
        }
      },
    }),
    computer_type: tool({
      description: "Type into the open page. Optional CSS selector focuses a field first.",
      inputSchema: z.object({ text: z.string(), target: z.string().optional() }),
      execute: async ({ text, target }) => {
        try {
          await typePage(actor.name, text, target);
          return { ok: true, summary: "Typed into the page" };
        } catch (error) {
          return failed(error);
        }
      },
    }),
  } satisfies ToolSet;
}
