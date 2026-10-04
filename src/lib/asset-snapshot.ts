// Imported plans are source snapshots, never live balances or realized transactions.
export type ForecastRow = {
  name: string; starting_balance: number; change: number; projected_balance: number; note: string;
};
export type AssetSnapshot = {
  version: 1; source_label: string; received_date: string; source_basis_date: string | null;
  pending_assets: { id: string; name: string; balance: number; reason: string }[];
  forecast: { month: string; loans: ForecastRow[]; savings: ForecastRow[] };
};
const bad = () => new Error("가져온 자산 계획의 형식이나 금액을 확인하지 못했습니다.");
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw bad();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max) throw bad();
  return value;
}
function amount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000_000) throw bad();
  return value;
}
function date(value: unknown): string {
  const s = text(value, 10);
  if (!/^(19|[2-9]\d)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)) throw bad();
  const d = new Date(`${s}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw bad();
  return s;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 100) throw bad();
  return value;
}
function forecastRows(value: unknown, direction: -1 | 1): ForecastRow[] {
  return list(value).map(input => {
    const r = object(input);
    const row = { name: text(r.name, 120), starting_balance: amount(r.starting_balance),
      change: amount(r.change), projected_balance: amount(r.projected_balance), note: text(r.note, 500) };
    if (!row.name.trim() || row.starting_balance + direction * row.change !== row.projected_balance) throw bad();
    return row;
  });
}
export function parseAssetSnapshot(value: unknown): AssetSnapshot {
  const r = object(value), forecast = object(r.forecast);
  if (r.version !== 1) throw bad();
  const month = text(forecast.month, 7);
  if (!/^(19|[2-9]\d)\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw bad();
  const pending_assets = list(r.pending_assets).map(input => {
    const p = object(input), id = text(p.id, 36), name = text(p.name, 120);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !name.trim()) throw bad();
    return { id, name, balance: amount(p.balance), reason: text(p.reason, 500) };
  });
  if (new Set(pending_assets.map(p => p.id)).size !== pending_assets.length) throw bad();
  return { version: 1, source_label: text(r.source_label, 200), received_date: date(r.received_date),
    source_basis_date: r.source_basis_date === null ? null : date(r.source_basis_date), pending_assets,
    forecast: { month, loans: forecastRows(forecast.loans, -1), savings: forecastRows(forecast.savings, 1) } };
}
