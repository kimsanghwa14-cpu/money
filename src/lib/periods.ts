import { koreaDate, validDate, validMonth, type LedgerData } from "./domain.ts";

export const PERIOD_MODES = { payroll: "급여주기", all: "전체 내역", custom: "기간 직접 선택", calendar: "달력월" } as const;
export type PeriodMode = keyof typeof PERIOD_MODES;
export type PeriodSelection = { mode: PeriodMode; month: string; start: string; end: string };
export type LedgerPeriod = { mode: PeriodMode; month: string; start: string | null; end: string | null; annual: boolean };
export type PeriodLedgerData = LedgerData & { period: LedgerPeriod };
export function shiftMonth(month: string, step: number): string {
  if (!validMonth(month) || !Number.isInteger(step)) throw new Error("올바른 연월이 필요합니다.");
  const [year, m] = month.split("-").map(Number), index = year * 12 + m - 1 + step;
  const next = `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
  if (!validMonth(next)) throw new Error("지원하는 연월 범위를 벗어났습니다.");
  return next;
}
export function payrollMonth(date = koreaDate()): string {
  if (!validDate(date)) throw new Error("기준일을 확인하세요.");
  const month = date.slice(0, 7);
  return Number(date.slice(8)) >= 21 || month === "1900-01" ? month : shiftMonth(month, -1);
}
export function initialPeriod(date = koreaDate()): PeriodSelection {
  return { mode: "payroll", month: payrollMonth(date), start: `${date.slice(0, 7)}-01`, end: date };
}
export function resolvePeriod(selection: PeriodSelection, annual = false): LedgerPeriod {
  const { mode, month } = selection;
  if (!Object.hasOwn(PERIOD_MODES, mode) || !validMonth(month) || month > "9998-12") throw new Error("조회 방식과 연월을 확인하세요.");
  if (annual && mode !== "payroll" && mode !== "calendar") throw new Error("연간 비교는 급여주기 또는 달력월에서 선택하세요.");
  if (mode === "all") return { mode, month, start: null, end: null, annual: false };
  if (mode === "custom") {
    if (!validDate(selection.start) || !validDate(selection.end) || selection.start > selection.end) throw new Error("실제 존재하는 시작일·종료일을 순서대로 선택하세요.");
    return { mode, month, start: selection.start, end: selection.end, annual: false };
  }
  const first = annual ? `${month.slice(0, 4)}-01` : month;
  const next = shiftMonth(first, annual ? 12 : 1);
  const start = `${first}-${mode === "payroll" ? "21" : "01"}`;
  const lastDate = new Date(`${next}-01T00:00:00Z`);
  lastDate.setUTCDate(lastDate.getUTCDate() - 1);
  const end = mode === "payroll" ? `${next}-20` : lastDate.toISOString().slice(0, 10);
  return { mode, month, start, end, annual };
}
export function periodContains(period: LedgerPeriod, date: string): boolean {
  return (!period.start || date >= period.start) && (!period.end || date <= period.end);
}
export function entryDate(period: LedgerPeriod, today = koreaDate()): string {
  return periodContains(period, today) ? today : period.start ?? today;
}
export function periodTitle(period: LedgerPeriod): string {
  if (period.mode === "all") return "전체 등록 내역";
  if (period.mode === "custom") return "직접 선택한 기간";
  const suffix = period.mode === "payroll" ? "급여분" : "달력월";
  return period.annual ? `${period.month.slice(0, 4)}년 ${suffix} 연간` : `${period.month.slice(0, 4)}년 ${Number(period.month.slice(5))}월 ${suffix}`;
}
export function periodDates(period: LedgerPeriod): string {
  return period.start && period.end ? `${period.start} ~ ${period.end} (양 끝 날짜 포함)` : "저장된 모든 날짜 · 이미 생성된 예정 내역 포함";
}
export function periodFileLabel(period: LedgerPeriod): string {
  return period.mode === "all" ? "전체기간" : `${period.start}_${period.end}`;
}
export function ledgerUrl(selection: PeriodSelection, annual = false): string {
  const period = resolvePeriod(selection, annual);
  const params = new URLSearchParams({ mode: period.mode, month: period.month });
  if (period.mode === "custom") { params.set("start", period.start!); params.set("end", period.end!); }
  if (annual) params.set("annual", "1");
  return `/api/ledger?${params}`;
}
export function selectionFromParams(params: URLSearchParams): PeriodSelection {
  // Keep older integrations that send only month on their original calendar-month contract.
  const mode = params.get("mode") ?? "calendar";
  if (!Object.hasOwn(PERIOD_MODES, mode)) throw new Error("지원하지 않는 조회 방식입니다.");
  return { mode: mode as PeriodMode, month: params.get("month") ?? "", start: params.get("start") ?? "", end: params.get("end") ?? "" };
}
