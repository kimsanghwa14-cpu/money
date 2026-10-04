"use client";
import { useEffect, useState, type FormEvent } from "react";
import { koreaDate } from "@/lib/domain";
import { PERIOD_MODES, initialPeriod, periodDates, periodTitle, resolvePeriod, shiftMonth, type PeriodMode, type PeriodSelection } from "@/lib/periods";

type Props = { value: PeriodSelection; annual: boolean; onChange: (next: PeriodSelection, annual: boolean) => boolean };
export default function PeriodControls({ value, annual, onChange }: Props) {
  const [start, setStart] = useState(value.start), [end, setEnd] = useState(value.end), [error, setError] = useState("");
  useEffect(() => { setStart(value.start); setEnd(value.end); setError(""); }, [value]);
  const period = resolvePeriod(value, annual);
  const switchMode = (mode: PeriodMode) => {
    if (mode === value.mode) return;
    const current = resolvePeriod(value, false);
    const today = koreaDate();
    const next = { ...value, mode, ...(mode === "custom" ? { start: current.start ?? `${today.slice(0,7)}-01`, end: current.end ?? today } : {}) };
    if (mode === "payroll" && value.mode === "calendar") next.month = initialPeriod(`${value.month}-${today.startsWith(value.month) ? today.slice(8) : "21"}`).month;
    if (onChange(next, false)) setError("");
  };
  const move = (step: number) => {
    try { onChange({ ...value, month: shiftMonth(value.month, step) }, annual); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "기간을 이동하지 못했습니다."); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = { ...value, start, end };
    try { resolvePeriod(next); if (onChange(next, false)) setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "날짜를 확인하세요."); }
  };
  return <section className="panel period-controls" aria-label="조회 기간 설정">
    <div className="view-toolbar"><div className="segmented" role="group" aria-label="조회 방식">
      {Object.entries(PERIOD_MODES).map(([mode, label]) => <button key={mode} aria-pressed={value.mode === mode} className={value.mode === mode ? "active" : ""} onClick={() => switchMode(mode as PeriodMode)}>{label}</button>)}
    </div><button onClick={() => onChange(initialPeriod(), false)}>현재 급여주기</button></div>
    {(value.mode === "payroll" || value.mode === "calendar") ? <div className="view-toolbar">
      <div className="month-picker"><button aria-label="이전 기간" disabled={value.month <= (annual ? "1900-12" : "1900-01")} onClick={() => move(annual ? -12 : -1)}>‹</button>
        <input aria-label="조회 연월" type="month" min="1900-01" max="9998-12" value={value.month} onChange={event => { if (event.target.value) onChange({ ...value, month: event.target.value }, annual); }} />
        <button aria-label="다음 기간" disabled={value.month >= (annual ? "9998-01" : "9998-12")} onClick={() => move(annual ? 12 : 1)}>›</button></div>
      <div className="segmented"><button aria-pressed={!annual} className={!annual ? "active" : ""} onClick={() => onChange(value, false)}>{value.mode === "payroll" ? "한 급여주기" : "월간"}</button><button aria-pressed={annual} className={annual ? "active" : ""} onClick={() => onChange(value, true)}>연간</button></div>
    </div> : null}
    {value.mode === "custom" ? <form className="view-toolbar" onSubmit={submit}>
      <label>시작일 <input aria-label="조회 시작일" type="date" required min="1900-01-01" max="9999-12-31" value={start} onChange={event => setStart(event.target.value)} /></label>
      <span>~</span><label>종료일 <input aria-label="조회 종료일" type="date" required min="1900-01-01" max="9999-12-31" value={end} onChange={event => setEnd(event.target.value)} /></label>
      <button className="primary" type="submit">기간 적용</button>
    </form> : null}
    <p data-testid="period-label"><strong>{periodTitle(period)}</strong> · {periodDates(period)}</p>
    <p className="muted">{value.mode === "payroll" ? "급여를 받는 달의 21일부터 다음 달 20일까지 함께 집계합니다. 실제 거래일은 변경하지 않습니다." : value.mode === "calendar" ? "기존 달력월 방식입니다. 월별 계획예산은 이 화면에서 별도로 관리합니다." : "월을 나누지 않고 저장된 내역을 함께 조회합니다. 새 고정비 예정 내역은 급여주기·달력월 조회 시 생성됩니다."}</p>
    {error ? <p role="alert" className="notice error-notice">{error}</p> : null}
  </section>;
}
