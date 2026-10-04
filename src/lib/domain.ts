export const OWNERS = ["상화", "하율", "기타"] as const;
export type Owner = typeof OWNERS[number];
export const KINDS = {
  income: "수입", expense: "소비지출", saving: "저축·투자", loan_principal: "대출원금 상환",
  transfer: "내부이체", refund: "환불", settlement: "카드대금 정산", loan_received: "대출금 수령",
} as const;
export type Kind = keyof typeof KINDS;
export const STATUSES = { planned: "예정", confirmed: "확정", cancelled: "취소" } as const;
export type Status = keyof typeof STATUSES;
export type Category = { id: string; family_id: string; kind: Kind; major: string; minor: string };
export type Named = { id: string; name: string };
export type Account = Named & { kind: "bank" | "card" | "asset" | "loan" };
export type Transaction = {
  id: string; date: string; owner: Owner; kind: Kind; category_id: string;
  description: string; amount: number; payment_method_id: string | null; account_id: string | null;
  target_account_id: string | null; status: Status; memo: string; version: number;
  planned_amount: number | null; original_transaction_id: string | null;
  source_id: string | null; source_namespace: string | null;
  recurrence_rule_id?: string | null; created_by?: string; updated_by?: string;
  created_at?: string; updated_at?: string;
};
export type Draft = Omit<Transaction, "amount" | "owner"> & { amount: string; owner: Owner | "" };
export type Budget = { id: string; month: string; owner: Owner; category_id: string; amount: number; label: string; version: number };
export type RecurringRule = {
  id: string; rule_id: string; effective_month: string; name: string; owner: Owner; kind: Kind;
  category_id: string; amount: number; payment_method_id: string | null; account_id: string | null;
  interval_months: number; day: number; start_month: string; end_month: string | null; enabled: boolean;
};
export type LedgerData = {
  family: { id: string; name: string }; member: { user_id: string; display_name: string; role: string };
  members?: { user_id: string; display_name: string }[];
  transactions: Transaction[]; categories: Category[]; accounts: Account[]; methods: Named[];
  budgets: Budget[]; rules: RecurringRule[]; annual_transactions?: Transaction[]; annual_budgets?: Budget[];
};
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_AMOUNT = 1_000_000_000_000;
export function koreaDate(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function koreaDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
}
export function validMonth(value: string): boolean { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && +value.slice(0, 4) >= 1900 && +value.slice(0, 4) <= 9999; }
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !validMonth(value.slice(0, 7))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function monthRange(month: string): [string, string] {
  if (!validMonth(month)) throw new Error("올바른 연월을 선택하세요.");
  const [year, m] = month.split("-").map(Number);
  return [`${month}-01`, `${m === 12 ? year + 1 : year}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`];
}
export function recurringDate(month: string, day: number): string {
  if (!validMonth(month) || !Number.isInteger(day) || day < 1 || day > 31) throw new Error("예정일은 1~31일이어야 합니다.");
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
export function parseAmount(value: unknown, allowZero = false): number {
  if (typeof value !== "string" && typeof value !== "number") throw new Error("금액은 원 단위 정수로 입력하세요.");
  const s = String(value).trim();
  if (!/^(\d+|\d{1,3}(,\d{3})+)$/.test(s)) throw new Error("금액은 원 단위 정수로 입력하세요. 예: 12,300");
  const n = Number(s.replaceAll(",", ""));
  if (!Number.isSafeInteger(n) || n > MAX_AMOUNT || n < (allowZero ? 0 : 1)) throw new Error(`금액은 ${allowZero ? "0" : "1"}~1,000,000,000,000원 범위로 입력하세요.`);
  return n;
}
export function money(amount: number): string { return `${amount.toLocaleString("ko-KR")}원`; }
export function sumSafe(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new Error("합계가 안전한 정수 범위를 초과했습니다. 조회 범위를 줄이세요.");
  return sum;
}
export type Summary = { income: number; expense: number; allocation: number; remaining: number; consumptionRemaining: number; plannedOut: number; plannedIncome: number };
export function summarize(rows: Transaction[], owner?: Owner): Summary {
  const result: Summary = { income: 0, expense: 0, allocation: 0, remaining: 0, consumptionRemaining: 0, plannedOut: 0, plannedIncome: 0 };
  for (const row of rows) {
    if (owner && row.owner !== owner || row.status === "cancelled") continue;
    if (row.status === "planned") {
      if (row.kind === "income") result.plannedIncome = sumSafe(result.plannedIncome, row.amount);
      if (["expense", "saving", "loan_principal"].includes(row.kind)) result.plannedOut = sumSafe(result.plannedOut, row.amount);
      continue;
    }
    if (row.kind === "income") result.income = sumSafe(result.income, row.amount);
    if (row.kind === "expense") result.expense = sumSafe(result.expense, row.amount);
    if (row.kind === "refund") result.expense = sumSafe(result.expense, -row.amount);
    if (["saving", "loan_principal"].includes(row.kind)) result.allocation = sumSafe(result.allocation, row.amount);
  }
  result.consumptionRemaining = sumSafe(result.income, -result.expense);
  result.remaining = sumSafe(result.consumptionRemaining, -result.allocation);
  return result;
}
export function budgetSummary(budgets: Budget[], categories: Category[]): Pick<Summary, "income" | "expense" | "allocation" | "remaining"> {
  const result = { income: 0, expense: 0, allocation: 0, remaining: 0 };
  for (const b of budgets) {
    const kind = categories.find(c => c.id === b.category_id)?.kind;
    if (kind === "income") result.income = sumSafe(result.income, b.amount);
    else if (kind === "expense") result.expense = sumSafe(result.expense, b.amount);
    else if (kind === "saving" || kind === "loan_principal") result.allocation = sumSafe(result.allocation, b.amount);
  }
  result.remaining = sumSafe(sumSafe(result.income, -result.expense), -result.allocation);
  return result;
}
export type CellErrors = Partial<Record<keyof Draft, string>>;
export function validateDraft(row: Draft, categories: Category[], methods: Named[], accounts: Account[]): CellErrors {
  const errors: CellErrors = {};
  if (!UUID.test(row.id)) errors.id = "거래 식별자가 올바르지 않습니다.";
  if (!validDate(row.date)) errors.date = "실제 존재하는 날짜를 YYYY-MM-DD로 입력하세요.";
  if (!OWNERS.includes(row.owner as Owner)) errors.owner = "상화·하율·기타 중 귀속을 확인하세요.";
  if (!Object.hasOwn(KINDS, row.kind)) errors.kind = "거래유형을 선택하세요.";
  if (!Object.hasOwn(STATUSES, row.status)) errors.status = "상태를 선택하세요.";
  const category = categories.find(c => c.id === row.category_id);
  if (!category || category.kind !== (row.kind === "refund" ? "expense" : row.kind)) errors.category_id = "거래유형에 맞는 분류를 선택하세요.";
  if (!row.description.trim() || row.description.length > 120) errors.description = "내용을 1~120자로 입력하세요.";
  if (row.memo.length > 500) errors.memo = "메모는 500자 이내로 입력하세요.";
  try { parseAmount(row.amount); } catch (e) { errors.amount = (e as Error).message; }
  if (row.payment_method_id && !methods.some(m => m.id === row.payment_method_id)) errors.payment_method_id = "등록된 결제수단을 선택하세요.";
  if (row.account_id && !accounts.some(a => a.id === row.account_id)) errors.account_id = "등록된 계좌·카드를 선택하세요.";
  if (row.target_account_id && !accounts.some(a => a.id === row.target_account_id)) errors.target_account_id = "받는 계좌를 확인하세요.";
  if (row.kind === "transfer" && (!row.account_id || !row.target_account_id || row.account_id === row.target_account_id)) errors.target_account_id = "내부이체는 서로 다른 출금·입금 계좌를 지정하세요.";
  if (row.kind === "settlement" && (!row.account_id || !row.target_account_id || row.account_id === row.target_account_id || accounts.find(a => a.id === row.target_account_id)?.kind !== "card")) errors.target_account_id = "카드 정산은 출금 계좌와 받는 카드 계좌를 지정하세요.";
  if (row.kind === "refund" && (!row.original_transaction_id || !UUID.test(row.original_transaction_id))) errors.original_transaction_id = "환불할 확정 소비지출의 거래 ID를 지정하세요.";
  if (!Number.isInteger(row.version) || row.version < 0) errors.version = "거래 버전을 확인하세요.";
  return errors;
}
export function toDraft(row: Transaction): Draft { return { ...row, amount: row.amount.toLocaleString("ko-KR") }; }
export function fromDraft(row: Draft): Transaction { return { ...row, owner: row.owner as Owner, amount: parseAmount(row.amount), description: row.description.trim() }; }
export function blankRow(owner: Owner | "", month: string, categories: Category[]): Draft {
  const today = koreaDate();
  return { id: crypto.randomUUID(), date: today.startsWith(month) ? today : `${month}-01`, owner,
    kind: "expense", category_id: categories.find(c => c.kind === "expense")?.id ?? "",
    description: "", amount: "", payment_method_id: null, account_id: null, target_account_id: null,
    status: "confirmed", memo: "", version: 0, planned_amount: null, original_transaction_id: null,
    source_id: null, source_namespace: null };
}
export function duplicateKey(row: Pick<Transaction, "date" | "amount" | "description" | "account_id" | "kind">): string {
  return [row.date, row.amount, row.description.trim().replace(/\s+/g, " ").toLowerCase(), row.account_id ?? "", row.kind].join("|");
}
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function exportCsv(rows: Transaction[], categories: Category[], methods: Named[], accounts: Account[]): string {
  const lines = [["거래ID", "날짜", "귀속", "거래유형", "대분류", "소분류", "내용", "금액", "결제수단", "계좌·카드", "상태", "메모", "예정금액", "원거래ID"]];
  for (const row of rows) {
    const c = categories.find(c => c.id === row.category_id);
    lines.push([row.id, row.date, row.owner, KINDS[row.kind], c?.major ?? "", c?.minor ?? "", row.description,
      String(row.amount), methods.find(m => m.id === row.payment_method_id)?.name ?? "", accounts.find(a => a.id === row.account_id)?.name ?? "",
      STATUSES[row.status], row.memo, row.planned_amount === null ? "" : String(row.planned_amount), row.original_transaction_id ?? ""]);
  }
  return "\ufeff" + lines.map(line => line.map(csvCell).join(",")).join("\r\n");
}
// Shared CSV/TSV parser: quoted commas, embedded newlines and escaped quotes are preserved.
export function parseDelimited(text: string, delimiter = "\t"): string[][] {
  text = text.replace(/^\ufeff/, "").replaceAll("\r\n", "\n");
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || cell === "") quoted = !quoted;
      else cell += ch;
    } else if (ch === delimiter && !quoted) { row.push(cell); cell = ""; }
    else if (ch === "\n" && !quoted) { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (quoted) throw new Error("닫히지 않은 따옴표가 있습니다. 원본 표를 확인하세요.");
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c !== ""));
}
