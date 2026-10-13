import { NextRequest, NextResponse } from "next/server";
import {
  loadSafeCommandConfig,
  loadUserPersistedSafeCommands,
  removeUserPersistedSafeCommand,
  saveUserPersistedSafeCommand,
} from "@/lib/computer/safety";

export async function GET() {
  const config = loadSafeCommandConfig();
  const userCommands = loadUserPersistedSafeCommands();
  return NextResponse.json({
    safePrefixes: config.safePrefixes,
    disallowedTokens: config.disallowedTokens,
    userCommands,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { command?: string; action?: "add" | "remove" };
    const command = body.command?.trim();
    if (!command) {
      return NextResponse.json({ error: "Command string is required." }, { status: 400 });
    }

    if (body.action === "remove") {
      const updated = removeUserPersistedSafeCommand(command);
      return NextResponse.json({ ok: true, userCommands: updated });
    }

    const updated = saveUserPersistedSafeCommand(command);
    return NextResponse.json({ ok: true, userCommands: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update safe commands." },
      { status: 500 },
    );
  }
}
