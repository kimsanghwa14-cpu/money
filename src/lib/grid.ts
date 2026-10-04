import { KINDS, STATUSES, blankRow, parseDelimited, type Account, type Category, type Draft, type Kind, type Named, type Owner, type Status } from "./domain.ts";
export const COLUMNS = [
  { key: "date", label: "날짜", width: 128 }, { key: "owner", label: "귀속", width: 88 },
  { key: "kind", label: "거래유형", width: 145 }, { key: "major", label: "대분류", width: 100 },
  { key: "minor", label: "소분류", width: 130 }, { key: "description", label: "내용", width: 190 },
  { key: "amount", label: "금액", width: 140 }, { key: "payment_method_id", label: "결제수단", width: 110 },
  { key: "account_id", label: "계좌·카드", width: 130 }, { key: "status", label: "상태", width: 95 },
  { key: "memo", label: "메모", width: 180 }, { key: "target_account_id", label: "받는 계좌·카드", width: 150 },
  { key: "original_transaction_id", label: "환불 원거래ID", width: 280 },
] as const;
export type ColumnKey = typeof COLUMNS[number]["key"];
export function categoryParts(row: Draft, categories: Category[]): [string, string] {
  const category = categories.find(c => c.id === row.category_id);
  if (category) return [category.major, category.minor];
  if (row.category_id.startsWith("unresolved:")) return row.category_id.slice(11).split("|") as [string, string];
  return ["", ""];
}
export function cellText(row: Draft, key: ColumnKey, categories: Category[], methods: Named[], accounts: Account[]): string {
  if (key === "major" || key === "minor") return categoryParts(row, categories)[key === "major" ? 0 : 1];
  if (key === "kind") return KINDS[row.kind] ?? row.kind;
  if (key === "status") return STATUSES[row.status] ?? row.status;
  if (key === "payment_method_id") return methods.find(m => m.id === row.payment_method_id)?.name ?? row.payment_method_id ?? "";
  if (key === "account_id" || key === "target_account_id") return accounts.find(a => a.id === row[key])?.name ?? row[key] ?? "";
  return String(row[key] ?? "");
}
export function applyPastedCells(original: Draft, values: string[], startCol: number, columns: ColumnKey[], categories: Category[], methods: Named[], accounts: Account[]): Draft {
  const row = { ...original }; let [major, minor] = categoryParts(row, categories); let categoryChanged = false;
  values.forEach((value, i) => {
    const key = columns[startCol + i]; if (!key) return;
    value = value.trim();
    if (key === "major") { major = value; categoryChanged = true; }
    else if (key === "minor") { minor = value; categoryChanged = true; }
    else if (key === "kind") { row.kind = (Object.keys(KINDS).find(k => KINDS[k as Kind] === value || k === value) ?? value) as Kind; categoryChanged = true; }
    else if (key === "status") row.status = (Object.keys(STATUSES).find(k => STATUSES[k as Status] === value || k === value) ?? value) as Status;
    else if (key === "payment_method_id") row.payment_method_id = value ? methods.find(m => m.name === value || m.id === value)?.id ?? value : null;
    else if (key === "account_id" || key === "target_account_id") row[key] = value ? accounts.find(a => a.name === value || a.id === value)?.id ?? value : null;
    else if (key === "owner") row.owner = value as Owner;
    else if (key === "original_transaction_id") row.original_transaction_id = value || null;
    else row[key] = value;
  });
  if (categoryChanged) row.category_id = categories.find(c => c.kind === (row.kind === "refund" ? "expense" : row.kind) && c.major === major && c.minor === minor)?.id ?? `unresolved:${major}|${minor}`;
  return row;
}
export function pasteRows(rows: Draft[], text: string, startRow: number, startCol: number, columns: ColumnKey[], owner: Owner | "", month: string, categories: Category[], methods: Named[], accounts: Account[]): Draft[] {
  let cells = parseDelimited(text);
  if (cells[0]?.[0] === "날짜") cells = cells.slice(1);
  if (startRow + cells.length > 1000) throw new Error("한 번에 입력 가능한 행은 1,000건입니다.");
  if (cells.some(r => r.length > columns.length - startCol)) throw new Error("붙여넣을 열이 표시된 열보다 많습니다. 보조 열을 표시하거나 복사할 열 수를 조정하세요.");
  const next = rows.map(r => ({ ...r }));
  cells.forEach((values, i) => {
    const index = startRow + i;
    if (!next[index]) next[index] = blankRow(owner, month, categories);
    next[index] = applyPastedCells(next[index], values, startCol, columns, categories, methods, accounts);
  });
  return next;
}
