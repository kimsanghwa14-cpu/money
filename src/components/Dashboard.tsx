"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { money, sumSafe, OWNERS, type LedgerData, type Owner } from "@/lib/domain";
import { monthlyFlows, previousMonth, change, chartSlices, share, type Slice, type MonthlyFlow } from "@/lib/dashboard";
import type { LedgerPeriod } from "@/lib/periods";
import FinancialStatus from "./FinancialStatus";
import SelectedPeriodDashboard from "./SelectedPeriodDashboard";
import "./dashboard.css";
type Props = { data: LedgerData; month: string; onDirty: (scope: string, dirty: boolean) => void; onSaved: () => Promise<void>; onTransactions: (owner?: Owner, filter?: string) => void; annual: boolean; setAnnual: (value: boolean) => void; rangePeriod?: LedgerPeriod };
const COLORS = ["#234f46", "#557a9b", "#ba8b42", "#85668d", "#668174", "#a16e6a"];
function Comparison({ value, previous, spending = false }: { value: number; previous?: number; spending?: boolean }) {
  const diff = change(value, previous);
  if (!diff) return <small className="flow-change">비교 데이터 없음</small>;
  const direction = diff.amount > 0 ? "▲ 증가" : diff.amount < 0 ? "▼ 감소" : "변동 없음";
  const tone = diff.amount === 0 ? "" : (spending ? diff.amount < 0 : diff.amount > 0) ? "favorable" : "caution";
  return <small className={`flow-change ${tone}`}>전월 대비 {direction} {diff.amount > 0 ? "+" : ""}{money(diff.amount)} {diff.percent === null ? "(증감률 계산 불가)" : `(${diff.percent > 0 ? "+" : ""}${diff.percent.toFixed(1)}%)`}</small>;
}
function Donut({ title, items, total }: { title: string; items: Slice[]; total: number }) {
  const segments = chartSlices(items), valid = total > 0 && segments.every(item => item.amount >= 0);
  let offset = 0;
  const stops = segments.map((item, i) => { const start = offset; offset += valid ? item.amount / total * 100 : 0; return `${COLORS[i % COLORS.length]} ${start}% ${offset}%`; });
  return <section className="flow-chart" aria-label={title}><h3>{title}</h3><div className="flow-chart-content">
    {valid ? <div role="img" aria-label={`${title} 합계 ${money(total)}. 항목별 금액과 비율은 목록 참조.`} className="flow-donut" style={{ background: `conic-gradient(${stops.join(",")})` }}><div><span>합계</span><strong>{money(total)}</strong></div></div> : <div className="flow-chart-empty">{segments.length ? "환불·음수 내역은 아래 금액으로 확인하세요." : "확정 내역 없음"}</div>}
    <ul className="flow-legend">{segments.map((item, i) => <li key={item.id}><span className="flow-dot" style={{ background: COLORS[i % COLORS.length] }} /><span>{item.label}</span><strong>{money(item.amount)}</strong><small>{valid ? share(item.amount, total) : "비율 계산 불가"}</small></li>)}</ul>
  </div>{items.length > segments.length ? <details><summary>모든 분류의 금액·비중 보기</summary><ul className="flow-full-list">{items.map(item => <li key={item.id}><span>{item.label}</span><strong>{money(item.amount)}</strong><small>{valid ? share(item.amount, total) : "비율 계산 불가"}</small></li>)}</ul></details> : null}</section>;
}
function MonthAnalysis({ flow, previous, onClose }: { flow: MonthlyFlow; previous?: MonthlyFlow; onClose: () => void }) {
  const [byCategory, setByCategory] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); ref.current?.scrollIntoView({ block: "start", behavior: "auto" }); }, [flow.month]);
  const costs = [{ id: "fixed", label: "고정비", amount: flow.fixed }, { id: "variable", label: "변동비", amount: flow.variable }, ...(flow.unclassified ? [{ id: "unknown", label: "구분 미지정·확인 필요", amount: flow.unclassified }] : [])];
  return <section ref={ref} tabIndex={-1} className="panel month-analysis" id="month-analysis" aria-labelledby="month-analysis-title" onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
    <div className="section-heading"><div><span className="eyebrow">월별 상세분석 · 달력월 기준</span><h2 id="month-analysis-title">{flow.month} 상세분석</h2></div><button onClick={onClose} aria-label="월별 상세분석 닫기">닫기 ×</button></div>
    <div className="flow-metrics detail-metrics">{([['수입', 'income'], ['총지출', 'expense'], ['잔액', 'balance']] as const).map(([label, key]) => <div key={key}><span>{label}</span><strong>{money(flow[key])}</strong><Comparison value={flow[key]} previous={previous?.[key]} spending={key === "expense"} /></div>)}</div>
    <div className="flow-charts"><Donut title="수입 구성" items={flow.incomeCategories} total={flow.income} /><div><div className="flow-chart-controls" role="group" aria-label="지출 분석 기준"><button aria-pressed={!byCategory} onClick={() => setByCategory(false)}>귀속별</button><button aria-pressed={byCategory} onClick={() => setByCategory(true)}>카테고리별</button></div><Donut title={byCategory ? "지출 카테고리 구성" : "상화 · 하율 · 기타 지출 구성"} items={byCategory ? flow.expenseCategories : flow.owners} total={flow.expense} /></div></div>
    <div className="flow-detail-grid"><section><h3>고정비 / 변동비</h3><p className="muted">확정 소비지출과 환불 기준 · 총지출 {money(flow.expense)}</p><ul className="flow-full-list" data-testid="cost-breakdown">{costs.map(item => <li key={item.id}><span>{item.label}</span><strong>{money(item.amount)}</strong><small>{costs.every(c => c.amount >= 0) ? share(item.amount, flow.expense) : "비율 계산 불가"}</small></li>)}</ul><p className="flow-note">고정비는 기존 반복규칙 또는 직접 지정한 구분을 사용합니다. 변동비는 원장에서 지정한 지출만 합산합니다. 구분 미지정 거래는 추정하지 않으며 원장의 ‘지출 구분’에서 선택할 수 있습니다. 환불은 원거래의 구분을 따릅니다.</p><p className="flow-note">저축·투자·대출원금 상환 {money(flow.allocation)}은 소비지출에서 제외합니다. 이를 뺀 여유자금은 {money(sumSafe(flow.balance, -flow.allocation))}입니다.</p></section>
    <section><h3>주요 지출 순위</h3><ol className="flow-ranking">{flow.expenseCategories.filter(item => item.amount > 0).slice(0, 8).map(item => <li key={item.id}><span>{item.label}</span><strong>{money(item.amount)}</strong></li>)}</ol>{!flow.expenseCategories.some(item => item.amount > 0) ? <p className="muted">순지출이 있는 분류가 없습니다.</p> : null}<p className="flow-note">환불을 차감한 카테고리별 순지출 순위입니다.</p></section></div>
  </section>;
}
export default function Dashboard(props: Props) {
  const { data } = props;
  const [allData, setAllData] = useState<LedgerData | null>(null), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  const [year, setYear] = useState(""), [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setAllData(null); setError(""); setSelectedMonth(null);
    void (async () => { try {
      const response = await fetch("/api/dashboard", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "월별 흐름을 조회하지 못했습니다.");
      if (!Array.isArray(body.transactions) || body.record_count !== body.transactions.length || body.family?.id !== data.family.id) throw new Error("가족의 전체 거래를 확인하지 못했습니다. 다시 조회하세요.");
      if (!controller.signal.aborted) setAllData(body);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "월별 흐름 조회 실패"); } })();
    return () => controller.abort();
  }, [data, revision]);
  const result = useMemo(() => { try { return { flows: allData ? monthlyFlows(allData.transactions, allData.categories) : [], error: "" }; } catch (cause) { return { flows: [], error: cause instanceof Error ? cause.message : "집계 실패" }; } }, [allData]);
  const flows = result.flows, flowMap = useMemo(() => new Map(flows.map(flow => [flow.month, flow])), [flows]);
  const latest = flows.at(-1);
  const years = [...new Set(flows.map(flow => flow.month.slice(0, 4)))].reverse(), chosenYear = years.includes(year) ? year : years[0];
  const yearFlows = flows.filter(flow => flow.month.startsWith(`${chosenYear}-`));
  const annualTotals = [
    yearFlows.reduce((total, flow) => sumSafe(total, flow.income), 0),
    yearFlows.reduce((total, flow) => sumSafe(total, flow.expense), 0),
    ...OWNERS.map(owner => yearFlows.reduce((total, flow) => sumSafe(total, flow.owners.find(item => item.id === owner)?.amount ?? 0), 0)),
    yearFlows.reduce((total, flow) => sumSafe(total, flow.balance), 0),
  ];
  const selected = selectedMonth ? flowMap.get(selectedMonth) : undefined;
  const close = () => { setSelectedMonth(null); trigger.current?.focus(); };
  return <div className="finance-dashboard">
    <FinancialStatus familyId={data.family.id} />
    {error || result.error ? <section className="panel notice error-notice" role="alert">{error || result.error}<button onClick={() => setRevision(n => n + 1)}>월별 흐름 다시 조회</button></section> : !allData ? <section className="panel" role="status">전체 거래에서 월별 흐름을 계산하는 중…</section> : latest ? <>
      <section className="panel monthly-flow-table" aria-labelledby="monthly-flow-title"><div className="section-heading"><div><h2 id="monthly-flow-title">월별 수입·지출 집계표</h2><p>상화 + 하율 + 기타 = 총지출 · 잔액을 누르면 상세분석이 펼쳐집니다.</p></div><label className="flow-year">조회 연도<select aria-label="집계표 조회 연도" value={chosenYear} onChange={e => { setYear(e.target.value); setSelectedMonth(null); }}>{years.map(value => <option key={value} value={value}>{value}년</option>)}</select></label></div>
      <div className="table-scroll" role="region" aria-label="월별 수입 지출 표" tabIndex={0}><table className="report-table flow-table"><caption className="sr-only">달력월 기준 확정 거래. 잔액은 수입에서 소비지출을 뺀 금액입니다.</caption><thead><tr><th scope="col" rowSpan={2}>월</th><th scope="col" rowSpan={2} className="numeric">수입</th><th scope="colgroup" colSpan={4} className="expense-group">총지출</th><th scope="col" rowSpan={2} className="numeric flow-balance-heading">잔액</th></tr><tr>{["합계", "상화", "하율", "기타"].map(label => <th key={label} scope="col" className="numeric">{label}</th>)}</tr></thead><tbody><tr className="flow-annual-total" data-testid="flow-annual-total"><th scope="row">합계<span className="sr-only"> · {chosenYear}년</span></th>{annualTotals.map((amount, index) => <td key={index} className="numeric">{money(amount)}</td>)}</tr>{Array.from({ length: 12 }, (_, i) => `${chosenYear}-${String(i + 1).padStart(2, '0')}`).map(month => { const flow = flowMap.get(month); return <tr key={month} className={selectedMonth === month ? "flow-selected" : ""} data-testid={`flow-${month}`}><th scope="row">{Number(month.slice(5))}월</th>{flow ? <><td className="numeric">{money(flow.income)}</td><td className="numeric flow-total">{money(flow.expense)}</td>{flow.owners.map(owner => <td className="numeric" key={owner.id}>{money(owner.amount)}</td>)}<td className="numeric"><button className="flow-balance-button" aria-label={`${month} 잔액 ${money(flow.balance)} 상세분석`} aria-expanded={selectedMonth === month} aria-controls="month-analysis" onClick={e => { trigger.current = e.currentTarget; setSelectedMonth(selectedMonth === month ? null : month); }}>{money(flow.balance)} <span aria-hidden="true">↗</span></button></td></> : <td colSpan={6} className="muted">확정 내역 없음</td>}</tr>; })}</tbody></table></div><p className="flow-note">조회 조건의 급여주기·직접 선택 기간과 구분하여, 이 표는 매월 1일부터 말일까지 같은 기준으로 비교합니다. 예정·취소 거래와 이체·카드정산·대출금 수령은 제외합니다.</p></section>
      {selected ? <MonthAnalysis key={selected.month} flow={selected} previous={flowMap.get(previousMonth(selected.month))} onClose={close} /> : null}
    </> : <section className="panel"><h2>월별 흐름을 기다리고 있어요</h2><p>확정된 수입·지출이 등록되면 월별 비교와 상세분석을 확인할 수 있습니다.</p></section>}
    <details className="panel selected-period-tools"><summary>선택 기간의 거래·예산·고정비 자세히 보기</summary><SelectedPeriodDashboard {...props} /></details>
  </div>;
}
