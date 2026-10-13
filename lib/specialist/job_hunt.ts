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

export interface RecordApplicationResult {
  applications: JobApplication[];
  isDuplicate: boolean;
  updated: boolean;
  preview: {
    role: string;
    company: string;
    status: ApplicationStatus;
    action: "created" | "updated" | "duplicate_detected";
  };
}

export function checkApplicationDuplicate(app: JobApplication, existing: JobApplication[]): { isDuplicate: boolean; index: number } {
  const idx = existing.findIndex(
    (a) => a.company.toLowerCase() === app.company.toLowerCase() && a.role.toLowerCase() === app.role.toLowerCase(),
  );
  return { isDuplicate: idx >= 0, index: idx };
}

export function recordApplication(
  app: JobApplication,
  cubeSlug = "job-hunt",
  options?: { confirmDuplicate?: boolean },
): RecordApplicationResult {
  const root = ensureWorkspace(cubeSlug, false);
  const targetFile = "notes/applications.md";
  let existing: JobApplication[] = [];
  try {
    const file = readText(root, targetFile);
    existing = parseApplicationsMarkdown(file.text);
  } catch {
    existing = [];
  }

  const { isDuplicate, index } = checkApplicationDuplicate(app, existing);

  if (isDuplicate) {
    // If exact same status and step, flag as duplicate unless confirmed
    const prev = existing[index];
    const isExact = prev.status === app.status && prev.nextStep === app.nextStep && prev.link === app.link;
    if (isExact && !options?.confirmDuplicate) {
      return {
        applications: existing,
        isDuplicate: true,
        updated: false,
        preview: {
          role: app.role,
          company: app.company,
          status: app.status,
          action: "duplicate_detected",
        },
      };
    }

    existing[index] = { ...existing[index], ...app };
    const updatedMarkdown = formatApplicationsMarkdown(existing);
    writeText(root, targetFile, updatedMarkdown);
    return {
      applications: existing,
      isDuplicate: true,
      updated: true,
      preview: {
        role: app.role,
        company: app.company,
        status: app.status,
        action: "updated",
      },
    };
  }

  existing.unshift(app);
  const updatedMarkdown = formatApplicationsMarkdown(existing);
  writeText(root, targetFile, updatedMarkdown);
  return {
    applications: existing,
    isDuplicate: false,
    updated: false,
    preview: {
      role: app.role,
      company: app.company,
      status: app.status,
      action: "created",
    },
  };
}
