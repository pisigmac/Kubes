import { ensureWorkspace, readText, writeText } from "../computer/jail.ts";

export interface LedgerTransaction {
  date: string;
  payee: string;
  category: string;
  amount: number;
  type: "expense" | "income" | "subscription";
  notes?: string;
}

export interface BudgetSummary {
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  savingsRatePercent: number;
  byCategory: Record<string, number>;
  subscriptions: LedgerTransaction[];
}

const CSV_HEADER = "Date,Payee,Category,Amount,Type,Notes";

function cleanField(field: string): string {
  const trimmed = field.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"').trim();
  }
  return trimmed;
}

export function parseLedgerCsv(csvContent: string): LedgerTransaction[] {
  const lines = csvContent.split("\n").map((l) => l.trim()).filter(Boolean);
  const transactions: LedgerTransaction[] = [];

  for (const line of lines) {
    if (line.toLowerCase().startsWith("date,") || !line.includes(",")) continue;
    const parts = line.split(",").map((p) => cleanField(p));
    if (parts.length >= 4) {
      const amount = parseFloat(parts[3]) || 0;
      transactions.push({
        date: parts[0] || new Date().toISOString().slice(0, 10),
        payee: parts[1] || "Unknown",
        category: parts[2] || "Uncategorized",
        amount: Math.abs(amount),
        type: (parts[4] as "expense" | "income" | "subscription") || "expense",
        notes: parts[5] || "",
      });
    }
  }

  return transactions;
}

export function formatLedgerCsv(transactions: LedgerTransaction[]): string {
  const rows = transactions.map(
    (t) =>
      `${t.date},"${t.payee.replace(/"/g, '""')}","${t.category.replace(/"/g, '""')}",${t.amount},${t.type},"${(t.notes || "").replace(/"/g, '""')}"`,
  );
  return `${CSV_HEADER}\n${rows.join("\n")}\n`;
}

export function calculateBudgetSummary(transactions: LedgerTransaction[]): BudgetSummary {
  let totalIncome = 0;
  let totalExpenses = 0;
  const byCategory: Record<string, number> = {};
  const subscriptions: LedgerTransaction[] = [];

  for (const t of transactions) {
    if (t.type === "income") {
      totalIncome += t.amount;
    } else {
      totalExpenses += t.amount;
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
      if (t.type === "subscription") {
        subscriptions.push(t);
      }
    }
  }

  const netSavings = totalIncome - totalExpenses;
  const savingsRatePercent = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;

  return {
    totalIncome,
    totalExpenses,
    netSavings,
    savingsRatePercent,
    byCategory,
    subscriptions,
  };
}

export function recordTransaction(tx: LedgerTransaction, cubeSlug = "money"): BudgetSummary {
  const root = ensureWorkspace(cubeSlug, false);
  const targetFile = "notes/ledger.csv";
  let existing: LedgerTransaction[] = [];
  try {
    const file = readText(root, targetFile);
    existing = parseLedgerCsv(file.text);
  } catch {
    existing = [];
  }

  existing.unshift(tx);
  writeText(root, targetFile, formatLedgerCsv(existing));
  return calculateBudgetSummary(existing);
}
