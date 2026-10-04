import { OWNERS, UUID, parseAmount, sumSafe, validDate, type Owner } from "./domain.ts";

export const ASSET_KINDS = { deposit: "예금·현금", pension: "연금", investment: "투자", other: "기타 자산", loan: "대출" } as const;
export type AssetKind = keyof typeof ASSET_KINDS;
export type Asset = {
  id: string; name: string; owner: Owner; kind: AssetKind; basis_date: string;
  balance: number; memo: string; version: number; accounting: "manual" | "ledger";
  created_at: string; updated_at?: string; updated_by: string;
};
export type AssetForm = Pick<Asset, "id" | "name" | "owner" | "kind" | "basis_date" | "memo" | "version"> & { balance: string };
export function normalizeAsset(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("자산·대출 정보를 확인하세요.");
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !UUID.test(row.id) || !Number.isInteger(row.version) || (row.version as number) < 0) throw new Error("항목 ID·버전을 확인하세요.");
  if (typeof row.name !== "string" || !row.name.trim() || row.name.trim().length > 120) throw new Error("항목명은 1~120자로 입력하세요.");
  if (!OWNERS.includes(row.owner as Owner) || typeof row.kind !== "string" || !Object.hasOwn(ASSET_KINDS, row.kind)) throw new Error("귀속과 자산 종류를 선택하세요.");
  if (typeof row.basis_date !== "string" || !validDate(row.basis_date)) throw new Error("실제 존재하는 기준일을 입력하세요.");
  if (typeof row.memo !== "string" || row.memo.length > 500) throw new Error("메모는 500자 이내로 입력하세요.");
  return { id: row.id, version: row.version as number, name: row.name.trim(), owner: row.owner as Owner, kind: row.kind as AssetKind, basis_date: row.basis_date, balance: parseAmount(row.balance, true), memo: row.memo };
}
export function assetSummary(rows: Pick<Asset, "kind" | "balance">[]) {
  let assets = 0, loans = 0;
  for (const row of rows) {
    if (row.kind === "loan") loans = sumSafe(loans, row.balance);
    else assets = sumSafe(assets, row.balance);
  }
  return { assets, loans, net: sumSafe(assets, -loans) };
}
