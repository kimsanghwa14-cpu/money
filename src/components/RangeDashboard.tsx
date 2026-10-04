"use client";
import { money, summarize, sumSafe, type Owner } from "@/lib/domain";
import { payrollMonth, resolvePeriod, type PeriodLedgerData } from "@/lib/periods";
import Dashboard from "./Dashboard";
type Props = { data: PeriodLedgerData; onTransactions: (owner?: Owner, filter?: string) => void };
const ignoreDirty = () => {};
const ignoreSaved = async () => {};
const ignoreAnnual = () => {};
export default function RangeDashboard({ data, onTransactions }: Props) {
  const { period } = data;
  return <>
    <Dashboard data={data} month={period.month} onTransactions={onTransactions} onDirty={ignoreDirty} onSaved={ignoreSaved} annual={false} setAnnual={ignoreAnnual} rangePeriod={period} />
    {period.annual ? <section className="panel annual-overview"><div className="section-heading"><div><h2>{period.month.slice(0,4)}년 급여주기별 비교</h2><p>1월 급여분은 1월 21일~2월 20일, 12월 급여분은 다음 해 1월 20일까지입니다.</p></div></div>
      <div className="table-scroll"><table className="report-table"><thead><tr><th>급여분</th><th>기간</th><th className="numeric">확정 수입</th><th className="numeric">확정 지출·배분</th><th className="numeric">여유자금</th><th className="numeric">예정 수입</th><th className="numeric">예정 지출·배분</th></tr></thead><tbody>
        {Array.from({length:12},(_,i) => { const month=`${period.month.slice(0,4)}-${String(i+1).padStart(2,"0")}`, bounds=resolvePeriod({mode:"payroll",month,start:"",end:""}), s=summarize(data.transactions.filter(t=>payrollMonth(t.date)===month)); return <tr key={month}><th>{i+1}월 급여분</th><td>{bounds.start} ~ {bounds.end}</td>{[s.income,sumSafe(s.expense,s.allocation),s.remaining,s.plannedIncome,s.plannedOut].map((value,k)=><td className="numeric" key={k}>{money(value)}</td>)}</tr>; })}
      </tbody></table></div></section> : null}

  </>;
}
