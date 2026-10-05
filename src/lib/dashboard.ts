import { payrollMonth, resolvePeriod } from "./periods.ts";
import { OWNERS, summarize, sumSafe, type Transaction, type Category, type Owner } from "./domain.ts";
export type Slice = { id: string; label: string; amount: number };
export type MonthlyFlow = { month: string; income: number; expense: number; balance: number; allocation: number; owners: Slice[]; incomeCategories: Slice[]; expenseCategories: Slice[]; fixed: number; variable: number; unclassified: number; count: number };
const actual = (row: Transaction) => row.status === "confirmed" && ["income", "expense", "refund", "saving", "loan_principal"].includes(row.kind);
export function monthlyFlows(transactions: Transaction[], categories: Category[]): MonthlyFlow[] {
  const ids = new Set<string>(), originals = new Map(transactions.map(row => [row.id, row]));
  const groups = new Map<string, Transaction[]>(), names = new Map(categories.map(c => [c.id, `${c.major} · ${c.minor}`]));
  for (const row of transactions) {
    if (ids.has(row.id)) throw new Error("중복 거래가 조회되어 집계를 중단했습니다. 다시 조회하세요.");
    ids.add(row.id);
    if (!actual(row)) continue;
    const month = row.date.slice(0, 7);
    const group = groups.get(month) ?? []; group.push(row); groups.set(month, group);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([month, rows]) => {
    const summary = summarize(rows), income = new Map<string, number>(), expense = new Map<string, number>();
    let fixed = 0, variable = 0, unclassified = 0;
    for (const row of rows) {
      if (row.kind === "income") income.set(row.category_id, sumSafe(income.get(row.category_id) ?? 0, row.amount));
      if (row.kind !== "expense" && row.kind !== "refund") continue;
      const amount = row.kind === "refund" ? -row.amount : row.amount;
      expense.set(row.category_id, sumSafe(expense.get(row.category_id) ?? 0, amount));
      const source = row.kind === "refund" ? originals.get(row.original_transaction_id ?? "") : row;
      if (!source || source.kind !== "expense") unclassified = sumSafe(unclassified, amount);
      else if (source.cost_type === "fixed" || (!source.cost_type && source.recurrence_rule_id)) fixed = sumSafe(fixed, amount);
      else if (source.cost_type === "variable") variable = sumSafe(variable, amount);
      else unclassified = sumSafe(unclassified, amount);
    }
    const slices = (group: Map<string, number>) => [...group].map(([id, amount]) => ({ id, label: names.get(id) ?? "삭제되었거나 확인이 필요한 분류", amount })).sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
    return { month, income: summary.income, expense: summary.expense, balance: summary.consumptionRemaining, allocation: summary.allocation,
      owners: OWNERS.map(owner => ({ id: owner, label: owner, amount: summarize(rows, owner).expense })),
      incomeCategories: slices(income), expenseCategories: slices(expense), fixed, variable, unclassified, count: rows.length };
  });
}
export function previousMonth(month: string): string {
  const [year, m] = month.split("-").map(Number); return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`;
}
export function change(current: number, previous: number | undefined) {
  if (previous === undefined) return null;
  const amount = sumSafe(current, -previous);
  return { amount, percent: previous > 0 ? amount / previous * 100 : null };
}
export function chartSlices(items: Slice[], limit = 6): Slice[] {
  const sorted = items.filter(item => item.amount !== 0).slice().sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  if (sorted.length <= limit || sorted.some(item => item.amount < 0)) return sorted;
  return [...sorted.slice(0, limit - 1), { id: "grouped-other", label: "그 외 분류", amount: sorted.slice(limit - 1).reduce((n, item) => sumSafe(n, item.amount), 0) }];
}
export function share(amount: number, total: number): string { return total > 0 && amount >= 0 ? `${(amount / total * 100).toFixed(1)}%` : "비율 계산 불가"; }

export function payrollFlows(transactions: Transaction[], owner: Owner) {
  const ids = new Set<string>(), groups = new Map<string, Transaction[]>();
  for (const row of transactions) {
    if (ids.has(row.id)) throw new Error("중복 거래가 조회되어 집계를 중단했습니다. 다시 조회하세요.");
    ids.add(row.id);
    if (row.owner !== owner || !actual(row)) continue;
    const month = payrollMonth(row.date), group = groups.get(month) ?? [];
    group.push(row); groups.set(month, group);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([month, rows]) => {
    const summary = summarize(rows, owner), period = resolvePeriod({ mode: "payroll", month, start: "", end: "" });
    return { month, start: period.start!, end: period.end!, income: summary.income, expense: summary.expense,
      balance: summary.consumptionRemaining, allocation: summary.allocation, remaining: summary.remaining };
  });
}
