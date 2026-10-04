import fs from "node:fs";
import { screenshotExists, screenshotPath } from "@/lib/computer/jail";

export const dynamic = "force-dynamic";

export function GET() {
  if (!screenshotExists()) return new Response("No screenshot yet.", { status: 404 });
  const bytes = fs.readFileSync(screenshotPath());
  return new Response(bytes, {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
