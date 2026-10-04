"use client";
import { OWNERS, KINDS, STATUSES, money, summarize, sumSafe, type Owner } from "@/lib/domain";
import { payrollMonth, periodDates, periodTitle, resolvePeriod, type PeriodLedgerData } from "@/lib/periods";
import FinancialStatus from "./FinancialStatus";

type Props = { data: PeriodLedgerData; onTransactions: (owner?: Owner, filter?: string) => void };
export default function RangeDashboard({ data, onTransactions }: Props) {
  const total = summarize(data.transactions), { period } = data;
  const metrics = [
    { title: "확정 수입", value: total.income, note: `미확정 예정 수입 ${money(total.plannedIncome)}`, filter: "income" },
    { title: "소비지출", value: total.expense, note: "확정 소비 − 연결된 환불", filter: "expense" },
    { title: "저축·투자 / 원금상환", value: total.allocation, note: "소비와 구분한 확정 자금배분", filter: "allocation" },
    { title: "배분 후 여유자금", value: total.remaining, note: "확정 내역 기준 · 실제 계좌잔액과 다름", filter: "balance" },
    { title: "미확정 예정 지출·배분", value: total.plannedOut, note: "실제 실적에 포함하지 않음", filter: "plannedOut" },
  ];
  const categoryRows = data.categories.map(category => {
    const rows = data.transactions.filter(t => t.category_id === category.id);
    const actual = rows.filter(t => t.status === "confirmed").reduce((n,t) => sumSafe(n,t.kind === "refund" ? -t.amount : t.amount),0);
    const planned = rows.filter(t => t.status === "planned").reduce((n,t) => sumSafe(n,t.kind === "refund" ? -t.amount : t.amount),0);
    return { ...category, actual, planned };
  }).filter(row => ["income","expense","saving","loan_principal"].includes(row.kind) && (row.actual || row.planned));
  const fixed = data.transactions.filter(t => t.recurrence_rule_id);
  return <>
    <div className="metric-grid">{metrics.map((metric,index) => <button className={`metric ${index===3?"accent-metric":""}`} key={metric.title} onClick={() => onTransactions(undefined,metric.filter)}><span>{metric.title}</span><strong>{money(metric.value)}</strong><small>{metric.note}</small></button>)}</div>
    <p className="muted">{periodTitle(period)} · {periodDates(period)} · 같은 거래원장을 기간만 바꾸어 집계합니다.</p>
    {period.annual ? <section className="panel"><div className="section-heading"><div><h2>{period.month.slice(0,4)}년 급여주기별 비교</h2><p>1월 급여분은 1월 21일~2월 20일, 12월 급여분은 다음 해 1월 20일까지입니다.</p></div></div>
      <div className="table-scroll"><table className="report-table"><thead><tr><th>급여분</th><th>기간</th><th className="numeric">확정 수입</th><th className="numeric">확정 지출·배분</th><th className="numeric">여유자금</th><th className="numeric">예정 수입</th><th className="numeric">예정 지출·배분</th></tr></thead><tbody>
        {Array.from({length:12},(_,i) => { const month=`${period.month.slice(0,4)}-${String(i+1).padStart(2,"0")}`, bounds=resolvePeriod({mode:"payroll",month,start:"",end:""}), s=summarize(data.transactions.filter(t=>payrollMonth(t.date)===month)); return <tr key={month}><th>{i+1}월 급여분</th><td>{bounds.start} ~ {bounds.end}</td>{[s.income,sumSafe(s.expense,s.allocation),s.remaining,s.plannedIncome,s.plannedOut].map((value,k)=><td className="numeric" key={k}>{money(value)}</td>)}</tr>; })}
      </tbody></table></div></section> : null}
    <section className="panel"><div className="section-heading"><div><h2>상화·하율·기타 비교</h2><p>선택한 전체 기간에 대해 같은 기준으로 집계합니다.</p></div><button onClick={()=>onTransactions()}>기간 내 전체 거래</button></div>
      <div className="table-scroll"><table className="report-table"><thead><tr><th>귀속</th><th className="numeric">확정 수입</th><th className="numeric">소비지출</th><th className="numeric">저축·투자·상환</th><th className="numeric">여유자금</th><th className="numeric">예정 수입</th><th className="numeric">예정 지출·배분</th></tr></thead><tbody>
        {[...OWNERS,"전체" as const].map(owner=>{ const target=owner==="전체"?undefined:owner, s=summarize(data.transactions,target); return <tr key={owner} className={owner==="전체"?"total-row":""}><th><button className="text-button" onClick={()=>onTransactions(target)}>{owner}</button></th>{[s.income,s.expense,s.allocation,s.remaining,s.plannedIncome,s.plannedOut].map((value,i)=><td className="numeric" key={i}>{money(value)}</td>)}</tr>; })}
      </tbody></table></div></section>
    <section className="panel"><div className="section-heading"><div><h2>분류별 예정·확정 내역</h2><p>예정은 아직 확정하지 않은 거래입니다. 달력월 계획예산과 혼합하지 않습니다.</p></div></div>
      <div className="table-scroll"><table className="report-table"><thead><tr><th>유형·분류</th><th className="numeric">미확정 예정</th><th className="numeric">확정</th></tr></thead><tbody>{categoryRows.map(row=><tr key={row.id}><th>{KINDS[row.kind]} · {row.minor}</th><td className="numeric">{money(row.planned)}</td><td className="numeric"><button className="number-link" onClick={()=>onTransactions(undefined,`category:${row.id}`)}>{money(row.actual)}</button></td></tr>)}</tbody></table>{!categoryRows.length?<p className="empty">이 기간에 저장된 수입·지출·배분 내역이 없습니다.</p>:null}</div>
      <p className="muted">달력월 계획예산의 입력·비교는 상단 ‘달력월’에서 이용할 수 있습니다.</p>
    </section>
    <section className="panel"><div className="section-heading"><div><h2>기간 내 고정비 예정·확정</h2><p>날짜가 다른 달이어도 이 기간에 해당하면 함께 표시합니다.</p></div><button onClick={()=>onTransactions(undefined,"planned")}>예정 내역 검토·확정</button></div>
      <div className="table-scroll"><table className="report-table"><thead><tr><th>항목</th><th>귀속</th><th>일자</th><th className="numeric">예정금액</th><th className="numeric">현재금액</th><th>상태</th></tr></thead><tbody>{fixed.slice(0,200).map(t=><tr key={t.id}><th>{t.description}</th><td>{t.owner}</td><td>{t.date}</td><td className="numeric">{money(t.planned_amount??t.amount)}</td><td className="numeric">{money(t.amount)}</td><td><span className={`badge ${t.status==="planned"?"warning":""}`}>{STATUSES[t.status]}</span></td></tr>)}</tbody></table>{!fixed.length?<p className="empty">이 기간에 생성된 고정비 내역이 없습니다.</p>:null}</div>
      {fixed.length>200?<p className="muted">총 {fixed.length.toLocaleString("ko-KR")}건 중 앞 200건 표시. 전체 내역은 거래원장에서 조회하세요. 상단 합계는 전체 기간 기준입니다.</p>:null}
    </section>
    <FinancialStatus familyId={data.family.id}/>
    <section className="panel"><div className="section-heading"><h2>최근 거래내역</h2><button onClick={()=>onTransactions()}>조회·입력</button></div><div className="table-scroll"><table className="report-table"><thead><tr><th>날짜</th><th>귀속</th><th>내용</th><th>유형</th><th className="numeric">금액</th><th>상태</th></tr></thead><tbody>{[...data.transactions].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)).slice(0,8).map(t=><tr key={t.id}><td>{t.date}</td><td>{t.owner}</td><th>{t.description}</th><td>{KINDS[t.kind]}</td><td className="numeric">{money(t.amount)}</td><td>{STATUSES[t.status]}</td></tr>)}</tbody></table>{!data.transactions.length?<p className="empty">저장된 거래가 없습니다.</p>:null}</div></section>
  </>;
}
