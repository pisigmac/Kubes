import { isStepCount, ToolLoopAgent, tool, type ToolSet } from "ai";
import { z } from "zod";
import { languageModel } from "@/lib/ai/provider";
import { computerTools } from "@/lib/computer/tools";
import { coerceModel } from "@/lib/ai/models";
import type { Cube, CubeMutationResult, HandoffResult } from "@/lib/cubes/types";
import {
  createCube,
  getCubeBySlug,
  HttpError,
  listCubes,
  updateCube,
} from "@/lib/cubes/store";

function rosterText(cubes: Cube[]): string {
  return cubes
    .map((cube) => {
      const kind = cube.isMaestro ? "master" : "specialist";
      return `- ${cube.name} (slug: ${cube.slug}, ${kind}) — ${cube.painPoint}`;
    })
    .join("\n");
}

function publicCube(cube: Cube) {
  return {
    id: cube.id,
    slug: cube.slug,
    name: cube.name,
    painPoint: cube.painPoint,
    instructions: cube.instructions,
    model: cube.model,
    isMaestro: cube.isMaestro,
  };
}

function failure(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function computerBlock(cube: Cube, handoff: boolean): string {
  return `Computer: one shared machine, not the user's computer. Your files stay in your directory. Use computer_list, computer_read, computer_write, and computer_exec for scripts, markdown, and notes. Use computer_browse, computer_click, and computer_type for pages, and only repeat what the page shows. The browser and terminal are one seat.
${cube.isMaestro ? "You may read every Cube's files by slug. You cannot write their files. Hand the owner the change.\n" : ""}${handoff ? "handoff sends one other Cube a self-contained goal. Their reply is already on screen. Do not paste it. They will not hand the task onward.\n" : ""}Job hunt owns listings, applications, and follow-ups. Work owns the job the user already has.`;
}

function manageTools() {
  return {
    list_cubes: tool({
      description: "List every Cube: slug, name, pain point, instructions, and model.",
      inputSchema: z.object({}),
      execute: async () => ({
        cubes: listCubes().map(publicCube),
      }),
    }),
    create_cube: tool({
      description: "Create a specialist Cube when the user asks for a new one.",
      inputSchema: z.object({
        name: z.string(),
        painPoint: z.string(),
        instructions: z.string().describe("System prompt for the new Cube, second person"),
        model: z.string().optional(),
      }),
      execute: async ({ name, painPoint, instructions, model }): Promise<CubeMutationResult> => {
        try {
          const cube = createCube({
            name,
            painPoint,
            instructions,
            model: await coerceModel(model),
          });
          return { ok: true, cube };
        } catch (error) {
          return { ok: false, error: failure(error) };
        }
      },
    }),
    update_cube: tool({
      description: "Update a Cube's name, pain point, instructions, or model. Identify it by slug.",
      inputSchema: z.object({
        slug: z.string(),
        name: z.string().optional(),
        painPoint: z.string().optional(),
        instructions: z.string().optional(),
        model: z.string().optional(),
      }),
      execute: async ({ slug, name, painPoint, instructions, model }): Promise<CubeMutationResult> => {
        const cube = getCubeBySlug(slug.trim());
        if (!cube) return { ok: false, error: `No Cube with slug "${slug}".` };
        if (name === undefined && painPoint === undefined && instructions === undefined && model === undefined) {
          return { ok: false, error: "Nothing to change." };
        }
        try {
          const updated = updateCube(cube.id, {
            name,
            painPoint,
            instructions,
            model: model === undefined ? undefined : await coerceModel(model),
          });
          return { ok: true, cube: updated };
        } catch (error) {
          return { ok: false, error: failure(error) };
        }
      },
    }),
  } satisfies ToolSet;
}

function handoffTool(caller: Cube) {
  return tool({
    description:
      "Hand the user's goal to exactly one other Cube by slug. The Cube's reply is shown in the transcript. Do not hand it to yourself.",
    inputSchema: z.object({
      slug: z.string().describe("Other Cube slug, such as focus, write, or job-hunt"),
      goal: z
        .string()
        .describe("Self-contained goal, including constraints and details from the conversation"),
    }),
    execute: async function* ({ slug, goal }, { abortSignal }) {
      const cube = getCubeBySlug(slug.trim());
      if (!cube || cube.slug === caller.slug) {
        const missing: HandoffResult = {
          ok: false,
          cubeId: cube?.id ?? "",
          cubeName: cube?.name ?? slug,
          slug,
          reply: "",
          error: cube
            ? "Pick a different Cube."
            : `No Cube with slug "${slug}". Call list_cubes.`,
        };
        return missing;
      }

      const receiver = buildCubeAgent(cube, { handoff: false, manage: false });
      const result = await receiver.stream({
        prompt: `Respond directly to the user. Do not mention that you were handed this.\n\n${goal}`,
        abortSignal,
      });

      let reply = "";
      const activity: string[] = [];
      const partial = (): HandoffResult => ({
        ok: true,
        cubeId: cube.id,
        cubeName: cube.name,
        slug: cube.slug,
        reply,
        activity,
      });

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          reply += part.text;
          yield partial();
        } else if (part.type === "tool-result" && part.toolName.startsWith("computer_")) {
          activity.push(activityLine(part.output));
          yield partial();
        }
      }
      if (!reply) reply = await result.text;
      return partial();
    },
    toModelOutput: ({ output }) => {
      const result = output as HandoffResult | undefined;
      if (!result?.ok) return { type: "text" as const, value: result?.error ?? "Handoff failed." };
      const notes = result.activity?.length ? `\nComputer:\n${result.activity.join("\n")}` : "";
      return {
        type: "text" as const,
        value: `Handed to ${result.cubeName}. The user already sees this reply, so do not paste it again:\n${result.reply}${notes}`,
      };
    },
  });
}

function activityLine(output: unknown): string {
  if (output && typeof output === "object" && "summary" in output) {
    const summary = (output as { summary?: unknown }).summary;
    if (typeof summary === "string" && summary.trim()) return summary;
  }
  return "Used the computer";
}

function buildCubeAgent(cube: Cube, options: { handoff: boolean; manage: boolean }) {
  const roster = options.manage || options.handoff ? `\n\nCurrent roster:\n${rosterText(listCubes())}` : "";
  return new ToolLoopAgent({
    model: languageModel(cube.model),
    instructions: `${cube.instructions}\n\n${computerBlock(cube, options.handoff)}${roster}`,
    tools: {
      ...computerTools({ slug: cube.slug, name: cube.name, isMaestro: cube.isMaestro }),
      ...(options.handoff ? { handoff: handoffTool(cube) } : {}),
      ...(options.manage ? manageTools() : {}),
    },
    stopWhen: isStepCount(options.manage ? 16 : 12),
  });
}

export function buildMaestroAgent(cube: Cube) {
  return buildCubeAgent(cube, { handoff: true, manage: true });
}

export function buildSpecialistAgent(cube: Cube) {
  return buildCubeAgent(cube, { handoff: true, manage: false });
}

export async function runCubeInstruction(
  cube: Cube,
  instruction: string,
  signal: AbortSignal,
): Promise<string> {
  const agent = buildCubeAgent(cube, { handoff: false, manage: false });
  const result = await agent.generate({ prompt: instruction, abortSignal: signal });
  return result.text;
}
