import { ensureWorkspace, readText, writeText } from "../computer/jail.ts";

export type ApplicationStatus = "Wishlist" | "Applied" | "Interviewing" | "Offer" | "Rejected";

export interface JobApplication {
  role: string;
  company: string;
  link: string;
  status: ApplicationStatus;
  nextStep: string;
  date: string;
  notes?: string;
}

const HEADER = "| Role | Company | Link | Status | Next Step | Date | Notes |";
const DIVIDER = "| --- | --- | --- | --- | --- | --- | --- |";

export function parseApplicationsMarkdown(markdown: string): JobApplication[] {
  const lines = markdown.split("\n").map((l) => l.trim()).filter(Boolean);
  const apps: JobApplication[] = [];

  for (const line of lines) {
    if (!line.startsWith("|") || line.includes("---") || line.toLowerCase().includes("| role |")) {
      continue;
    }
    const cols = line
      .split("|")
      .map((c) => c.trim())
      .slice(1, -1);
    if (cols.length >= 6) {
      apps.push({
        role: cols[0] || "Unknown Role",
        company: cols[1] || "Unknown Company",
        link: cols[2] || "",
        status: (cols[3] as ApplicationStatus) || "Wishlist",
        nextStep: cols[4] || "",
        date: cols[5] || new Date().toISOString().slice(0, 10),
        notes: cols[6] || "",
      });
    }
  }

  return apps;
}

export function formatApplicationsMarkdown(apps: JobApplication[]): string {
  const rows = apps.map(
    (a) =>
      `| ${a.role.replace(/\|/g, "/")} | ${a.company.replace(/\|/g, "/")} | ${a.link.replace(/\|/g, "/")} | ${a.status} | ${a.nextStep.replace(/\|/g, "/")} | ${a.date} | ${(a.notes || "").replace(/\|/g, "/")} |`,
  );
  return `# Job Applications Tracker\n\n${HEADER}\n${DIVIDER}\n${rows.join("\n")}\n`;
}

export function getApplications(cubeSlug = "job-hunt"): JobApplication[] {
  const root = ensureWorkspace(cubeSlug, false);
  const targetFile = "notes/applications.md";
  try {
    const file = readText(root, targetFile);
    return parseApplicationsMarkdown(file.text);
  } catch {
    return [];
  }
}

export function recordApplication(app: JobApplication, cubeSlug = "job-hunt"): JobApplication[] {
  const root = ensureWorkspace(cubeSlug, false);
  const targetFile = "notes/applications.md";
  let existing: JobApplication[] = [];
  try {
    const file = readText(root, targetFile);
    existing = parseApplicationsMarkdown(file.text);
  } catch {
    existing = [];
  }

  // Update existing if company + role matches, else prepend
  const idx = existing.findIndex(
    (a) => a.company.toLowerCase() === app.company.toLowerCase() && a.role.toLowerCase() === app.role.toLowerCase(),
  );

  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...app };
  } else {
    existing.unshift(app);
  }

  const updatedMarkdown = formatApplicationsMarkdown(existing);
  writeText(root, targetFile, updatedMarkdown);
  return existing;
}
