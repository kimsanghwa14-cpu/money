"use client";
import { useEffect, useMemo, useState } from "react";
import { money, type LedgerData, type Owner, type Transaction } from "@/lib/domain";
import { payrollFlows } from "@/lib/dashboard";
import "./dashboard.css";
export default function PayrollSummary({ data, owner, selectedMonth }: { data: LedgerData; owner: Owner; selectedMonth: string }) {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [error, setError] = useState(""), [revision, setRevision] = useState(0), [year, setYear] = useState(selectedMonth.slice(0, 4));
  useEffect(() => {
    const controller = new AbortController(); setTransactions(null); setError("");
    void (async () => {
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "급여주기 내역을 조회하지 못했습니다.");
        if (!Array.isArray(body.transactions) || body.record_count !== body.transactions.length || body.family?.id !== data.family.id) throw new Error("가족의 전체 거래를 확인하지 못했습니다.");
        if (!controller.signal.aborted) setTransactions(body.transactions);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "조회 실패"); }
    })();
    return () => controller.abort();
  }, [data, revision]);
  const result = useMemo(() => {
    try { return { flows: transactions ? payrollFlows(transactions, owner) : [], error: "" }; }
    catch (cause) { return { flows: [], error: cause instanceof Error ? cause.message : "집계 실패" }; }
  }, [transactions, owner]);
  const years = [...new Set(result.flows.map(flow => flow.month.slice(0, 4)))].reverse();
  const chosenYear = years.includes(year) ? year : years[0];
  return <section className="panel payroll-summary" aria-label={`${owner} 급여주기별 요약표`}>
    <div className="section-heading"><div><h2>{owner} 급여주기별 요약표</h2><p>매월 21일 ~ 다음 달 20일 · 해당 개인의 확정 거래 기준</p></div>{years.length ? <label className="flow-year">조회 연도<select aria-label="급여주기 요약 조회 연도" value={chosenYear} onChange={e => setYear(e.target.value)}>{years.map(value => <option key={value} value={value}>{value}년</option>)}</select></label> : null}</div>
    {error || result.error ? <div role="alert">{error || result.error}<button onClick={() => setRevision(n => n + 1)}>다시 조회</button></div> : !transactions ? <p role="status">급여주기별 요약을 계산하는 중…</p> : !result.flows.length ? <p className="muted">확정된 개인 거래가 없습니다.</p> : <>
      <div className="table-scroll" role="region" aria-label={`${owner} 급여주기 요약 표`} tabIndex={0}><table className="report-table payroll-table"><caption className="sr-only">급여분은 시작월 기준이며 잔액은 수입에서 소비지출을 뺀 금액입니다.</caption><thead><tr>{["급여분", "기간", "수입", "소비지출", "잔액", "저축·투자·상환", "여유자금"].map((label, i) => <th key={label} scope="col" className={i > 1 ? "numeric" : ""}>{label}</th>)}</tr></thead><tbody>{result.flows.filter(flow => flow.month.startsWith(`${chosenYear}-`)).map(flow => <tr key={flow.month} data-testid={`payroll-${owner}-${flow.month}`} className={flow.month === selectedMonth ? "flow-selected" : ""}><th scope="row">{Number(flow.month.slice(5))}월 급여분</th><td>{flow.start} ~ {flow.end}</td>{(["income", "expense", "balance", "allocation", "remaining"] as const).map(key => <td key={key} className="numeric">{money(flow[key])}</td>)}</tr>)}</tbody></table></div>
      <p className="flow-note">잔액 = 수입 − 소비지출 · 여유자금 = 잔액 − 저축·투자·원금상환. 환불은 지출에서 차감하며 예정·취소·내부이체·카드정산은 제외합니다. 상단 조회 기간과 관계없이 전체 개인 거래를 급여주기로 집계합니다.</p>
    </>}
  </section>;
}
