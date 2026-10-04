import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { browse, clickPage, typePage } from "./browser.ts";
import {
  ensureWorkspace,
  execCommand,
  listTree,
  readRootFor,
  readText,
  resolveInside,
  writeText,
} from "./jail.ts";


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
    live_search: tool({
      description:
        "Perform real-time web search for current events, breaking news, live documentation, market data, and job listings with verified citations.",
      inputSchema: z.object({
        query: z.string().describe("Search keywords or natural language query"),
        maxResults: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ query, maxResults }) => {
        try {
          const { executeLiveSearch } = await import("../ai/search.ts");
          const searchResult = await executeLiveSearch(query, maxResults);
          return {
            ok: true,
            summary: `Searched web for "${query}" (${searchResult.results.length} sources)`,
            ...searchResult,
          };
        } catch (error) {
          return failed(error);
        }
      },
    }),
    memory_remember: tool({
      description:
        "Store a key user preference, fact, project detail, or context into long-term memory across sessions.",
      inputSchema: z.object({
        content: z.string().describe("The information/fact to remember"),
        category: z.enum(["preference", "project", "fact", "instruction", "general"]).optional().default("general"),
        keywords: z.array(z.string()).optional(),
      }),
      execute: async ({ content, category, keywords }) => {
        try {
          const { saveMemory } = await import("../memory/store.ts");
          const saved = saveMemory({
            cubeSlug: actor.slug,
            category,
            content,
            keywords,
          });
          return {
            ok: true,
            summary: `Remembered: "${content.slice(0, 60)}..."`,
            memoryId: saved.id,
          };
        } catch (error) {
          return failed(error);
        }
      },
    }),
    memory_recall: tool({
      description: "Search and recall relevant past memories, facts, and user preferences by topic.",
      inputSchema: z.object({
        query: z.string().describe("Topic or question to recall context for"),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ query, limit }) => {
        try {
          const { queryMemories } = await import("../memory/store.ts");
          const memories = queryMemories(actor.slug, query, limit);
          return {
            ok: true,
            summary: `Recalled ${memories.length} memories for "${query}"`,
            memories: memories.map((m) => ({ category: m.category, content: m.content, createdAt: m.createdAt })),
          };
        } catch (error) {
          return failed(error);
        }
      },
    }),
    job_application_track: tool({
      description:
        "Manage job applications in notes/applications.md. Record new job opportunities, update status, and set next steps.",
      inputSchema: z.object({
        role: z.string().describe("Job title or position"),
        company: z.string().describe("Company or organization name"),
        link: z.string().optional().default(""),
        status: z.enum(["Wishlist", "Applied", "Interviewing", "Offer", "Rejected"]).optional().default("Applied"),
        nextStep: z.string().optional().default("Follow up"),
        notes: z.string().optional().default(""),
      }),
      execute: async ({ role, company, link, status, nextStep, notes }) => {
        try {
          const { recordApplication } = await import("../specialist/job_hunt.ts");
          const apps = recordApplication(
            {
              role,
              company,
              link: link || "",
              status: status || "Applied",
              nextStep: nextStep || "",
              date: new Date().toISOString().slice(0, 10),
              notes: notes || "",
            },
            actor.slug,
          );
          return {
            ok: true,
            summary: `Recorded application: ${role} at ${company} [${status}]`,
            totalApplications: apps.length,
          };
        } catch (error) {
          return failed(error);
        }
      },
    }),
    money_ledger_record: tool({
      description:
        "Log a financial expense, income, or recurring subscription into notes/ledger.csv and compute current budget metrics.",
      inputSchema: z.object({
        payee: z.string().describe("Merchant, employer, or payee name"),
        amount: z.number().positive().describe("Amount in dollars/currency"),
        category: z.string().describe("Expense category e.g. Rent, Groceries, Cloud, Salary"),
        type: z.enum(["expense", "income", "subscription"]).optional().default("expense"),
        notes: z.string().optional().default(""),
      }),
      execute: async ({ payee, amount, category, type, notes }) => {
        try {
          const { recordTransaction } = await import("../specialist/money_ledger.ts");
          const summary = recordTransaction(
            {
              date: new Date().toISOString().slice(0, 10),
              payee,
              category,
              amount,
              type: type || "expense",
              notes: notes || "",
            },
            actor.slug,
          );
          return {
            ok: true,
            summary: `Recorded ${type}: $${amount} for ${payee} (${category})`,
            budgetSummary: summary,
          };
        } catch (error) {
          return failed(error);
        }
      },
    }),
    concept_diagram_create: tool({
      description:
        "Generate and save a visual Mermaid mind-map, flowchart, or architecture diagram artifact into notes/diagram.mmd.",
      inputSchema: z.object({
        title: z.string().describe("Diagram title"),
        mermaidCode: z.string().describe("Valid Mermaid syntax (e.g. flowchart TD / mindmap / sequenceDiagram)"),
        explanation: z.string().optional().describe("Brief conceptual explanation of the diagram"),
        fileName: z.string().optional().default("diagram.mmd"),
      }),
      execute: async ({ title, mermaidCode, explanation, fileName }) => {
        try {
          const { saveDiagramArtifact } = await import("../specialist/diagrams.ts");
          const result = saveDiagramArtifact(
            {
              title,
              type: "flowchart",
              mermaidCode,
              explanation,
            },
            actor.slug,
            fileName,
          );
          return {
            ok: true,
            summary: `Created diagram: "${title}" at ${result.path}`,
            path: result.path,
          };
        } catch (error) {
          return failed(error);
        }
      },
    }),
  } satisfies ToolSet;
}


