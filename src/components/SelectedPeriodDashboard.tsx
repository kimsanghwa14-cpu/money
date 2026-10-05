"use client";
import { OWNERS, KINDS, STATUSES, summarize, budgetSummary, money, sumSafe, type LedgerData, type Owner } from "@/lib/domain";
import BudgetEditor from "./BudgetEditor";
import { periodTitle, periodDates, type LedgerPeriod } from "@/lib/periods";
type Props = { data: LedgerData; month: string; onDirty: (scope: string, dirty: boolean) => void; onSaved: () => Promise<void>; onTransactions: (owner?: Owner, filter?: string) => void; annual: boolean; setAnnual: (value: boolean) => void; rangePeriod?: LedgerPeriod };
export default function SelectedPeriodDashboard({ data, month, onDirty, onSaved, onTransactions, annual, setAnnual, rangePeriod }: Props) {
  const isRange = !!rangePeriod || annual;
  const viewTitle = rangePeriod ? periodTitle(rangePeriod) : annual ? month.slice(0, 4) + "년" : Number(month.slice(5)) + "월";
  const total = summarize(data.transactions), planned = budgetSummary(data.budgets, data.categories);
  const categoryRows = data.categories.filter(c => ["income", "expense", "saving", "loan_principal"].includes(c.kind)).map(c => ({
    ...c,
    plan: (isRange ? [] : data.budgets).filter(b => b.category_id === c.id).reduce((sum, b) => sumSafe(sum, b.amount), 0),
    pending: data.transactions.filter(t => t.status === "planned" && t.category_id === c.id).reduce((sum, t) => sumSafe(sum, t.kind === "refund" ? -t.amount : t.amount), 0),
    actual: data.transactions.filter(t => t.status === "confirmed" && t.category_id === c.id).reduce((sum, t) => sumSafe(sum, t.kind === "refund" ? -t.amount : t.amount), 0),
  })).filter(c => c.plan !== 0 || c.actual !== 0 || (isRange && c.pending !== 0));
  const spending = categoryRows.filter(c => c.kind === "expense" && c.actual > 0).sort((a, b) => b.actual - a.actual || a.minor.localeCompare(b.minor));
  const highest = Math.max(1, ...spending.map(c => c.actual));
  const recurring = data.transactions.filter(t => t.recurrence_rule_id);
  const pending = recurring.filter(t => t.status === "planned").sort((a, b) => a.date.localeCompare(b.date));
  const confirmed = recurring.filter(t => t.status === "confirmed").length;
  const budgetRemaining = sumSafe(planned.expense, -total.expense);
  const budgetPercent = planned.expense > 0 ? Math.round(total.expense / planned.expense * 100) : null;
  const overBudget = categoryRows.filter(c => c.kind === "expense" && c.plan > 0 && c.actual > c.plan).length;
  const afterPlanned = sumSafe(total.remaining, -total.plannedOut);
  const metrics = [
    { label: "들어온 돈", amount: total.income, help: "확정 수입", filter: "income" },
    { label: "쓴 돈", amount: total.expense, help: "확정 소비지출 · 환불 차감", filter: "expense" },
    { label: "모으고 갚은 돈", amount: total.allocation, help: "저축·투자·대출 원금상환", filter: "allocation" },
  ];
  return <div className="dashboard-overview">
    <section className="month-overview" aria-labelledby="month-overview-title">
      <div className="overview-heading"><div><span className="eyebrow">선택 기간 가계 현황</span><h2 id="month-overview-title">{viewTitle}, 우리 집 돈 한눈에</h2></div><span className="badge">확정 내역 기준</span></div>
      <div className="money-overview">
        <button className={"remaining-card" + (total.remaining < 0 ? " is-negative" : "")} onClick={() => onTransactions(undefined, "balance")} data-testid="dashboard-remaining"><span>{isRange ? "이 기간 남은 돈" : "이번 달 남은 돈"}</span><strong>{money(total.remaining)}</strong><small>수입 − 소비지출 − 저축·투자·원금상환</small></button>
        <div className="money-metrics">{metrics.map(m => <button key={m.filter} className="money-metric" onClick={() => onTransactions(undefined, m.filter)} data-testid={"dashboard-" + m.filter}><span>{m.label}</span><strong>{money(m.amount)}</strong><small>{m.help}</small></button>)}</div>
      </div>
      {rangePeriod && <p className="overview-period">{periodDates(rangePeriod)}</p>}
      <div className="overview-foot"><span>남은 돈은 거래 내역으로 계산한 금액이며 실제 계좌잔액과 다를 수 있어요.</span><button className="text-button" onClick={() => onTransactions()}>거래 내역 보기 →</button></div>
    </section>
    <div className="dashboard-focus-grid">
      {isRange ? <>      <section className="panel budget-overview"><div className="section-heading"><h2>수입 중 얼마나 썼을까?</h2><span className="badge">소비지출 기준</span></div>{total.income > 0 ? <><div className="budget-headline"><strong>{Math.round(total.expense / total.income * 100)}%</strong><span>수입 대비 소비지출</span></div><div className="budget-meter"><span style={{width: Math.min(100, Math.max(0, total.expense / total.income * 100)) + "%"}} /></div><div className="budget-meter-labels"><span>소비지출 {money(total.expense)}</span><span>수입 {money(total.income)}</span></div><p className="muted">소비 후 {money(total.consumptionRemaining)} · 저축·투자·원금상환 전 금액</p></> : <div className="dashboard-empty"><strong>아직 확정된 수입이 없어요</strong><p>지출은 {money(total.expense)}이며 수입 대비 비율은 계산하지 않아요.</p></div>}<p className="muted chart-note">월별 계획예산은 상단 ‘달력월’에서 따로 비교할 수 있어요.</p></section>
</> : <>      <section className="panel budget-overview"><div className="section-heading"><h2>생활비 예산, 얼마나 썼을까?</h2>{budgetPercent !== null && <span className={"badge " + (budgetRemaining < 0 ? "warning" : "success")}>{budgetRemaining < 0 ? "예산 초과" : "예산 안에서 사용 중"}</span>}</div>
        {budgetPercent !== null ? <><div className="budget-headline"><strong data-testid="dashboard-budget-remaining">{money(Math.abs(budgetRemaining))}</strong><span>{budgetRemaining < 0 ? "예산보다 더 썼어요" : "예산이 남았어요"}</span></div><div className={"budget-meter" + (budgetRemaining < 0 ? " over-budget" : "")}><span style={{ width: Math.min(100, Math.max(0, budgetPercent)) + "%" }} /></div><div className="budget-meter-labels"><span>소비지출 {money(total.expense)}</span><span>예산 {money(planned.expense)}</span></div><p className="muted">예산 사용률 {budgetPercent}%{overBudget > 0 ? " · " + overBudget + "개 분류에서 예산 초과" : ""}</p></> : <div className="dashboard-empty"><strong>생활비 예산을 정해보세요</strong><p>예산을 등록하면 쓴 돈과 남은 예산을 바로 비교할 수 있어요.</p></div>}
        <button className="dashboard-link text-button" onClick={() => { const editor = document.getElementById("budget-editor") as HTMLDetailsElement | null; if (editor) { editor.open = true; editor.scrollIntoView({ block: "start" }); editor.querySelector("summary")?.focus(); } }}>이번 달 예산 설정 →</button>
      </section>
</>}
      <section className="panel"><div className="section-heading"><h2>돈이 많이 나간 곳</h2><span className="muted">상위 5개</span></div><div className="bar-chart spending-chart">{spending.slice(0, 5).map(c => <button className="spending-row" key={c.id} onClick={() => onTransactions(undefined, "category:" + c.id)}><span className="bar-label"><span>{c.major} · {c.minor}</span><strong>{money(c.actual)}</strong></span><span className="bar-track"><span style={{ width: c.actual / highest * 100 + "%" }} /></span></button>)}{!spending.length && <div className="dashboard-empty"><strong>아직 확정된 소비지출이 없어요</strong><p>지출을 기록하면 많이 쓴 분류부터 보여드려요.</p></div>}</div><p className="muted chart-note">환불은 차감하고, 저축과 원금상환은 따로 집계해요.</p></section>
    </div>
    <section className="panel recurring-overview"><div className="section-heading"><div><h2>{isRange ? "이 기간 확인할 고정비" : "이번 달 확인할 고정비"}</h2><p>고정비·반복거래 중 아직 확정하지 않은 내역이에요.</p></div><span className="recurring-tag">미확정 {pending.length}건 · 확정 {confirmed}건</span></div>
      <div className="planned-summary"><div><span>아직 나갈 예정인 돈</span><button className="number-link" onClick={() => onTransactions(undefined, "plannedOut")}>{money(total.plannedOut)}</button><small>고정비를 포함한 모든 예정 지출·배분</small></div><div><span>예정 지출까지 반영하면</span><strong className={afterPlanned < 0 ? "negative" : ""}>{money(afterPlanned)}</strong><small>현재 남은 돈 − 예정 지출·배분 · 예정 수입 제외</small></div></div>
      {total.plannedIncome > 0 && <p className="muted planned-income">예정 수입 {money(total.plannedIncome)}은 아직 들어오지 않아 계산에서 제외했어요.</p>}
      {pending.length ? <ul className="upcoming-list">{pending.slice(0, 4).map(t => <li key={t.id}><span className="upcoming-date">{t.date.slice(5).replace("-", "/")}</span><div><strong>{t.description}</strong><small>{t.owner} · {KINDS[t.kind]}</small></div><strong>{money(t.amount)}</strong></li>)}</ul> : <p className="dashboard-empty">확인할 고정비가 없어요. 새 반복 항목은 고정비 메뉴에서 등록할 수 있어요.</p>}
      <button className="dashboard-link text-button" onClick={() => onTransactions(undefined, "planned")}>예정 내역 검토·확정 →</button>
    </section>
    <section className="panel"><div className="section-heading"><h2>상화 · 하율 · 함께 쓴 돈</h2><span className="muted">귀속별 확정 내역</span></div><div className="owner-overview">{OWNERS.map(owner => { const s = summarize(data.transactions, owner); return <button key={owner} className="owner-card" onClick={() => onTransactions(owner)}><span className="owner-name">{owner === "기타" ? "기타 · 공통" : owner}<span aria-hidden="true">↗</span></span><dl><div><dt>수입</dt><dd>{money(s.income)}</dd></div><div><dt>소비지출</dt><dd>{money(s.expense)}</dd></div><div><dt>저축·투자·원금상환</dt><dd>{money(s.allocation)}</dd></div><div className="owner-remaining"><dt>남은 돈</dt><dd className={s.remaining < 0 ? "negative" : ""}>{money(s.remaining)}</dd></div></dl></button>; })}</div></section>
    {!rangePeriod && <section className="panel annual-overview"><div className="section-heading"><div><h2>올해 흐름 보기</h2><p>{month.slice(0, 4)}년 월별로 수입과 지출을 비교해요.</p></div><button aria-expanded={annual} onClick={() => setAnnual(!annual)}>{annual ? "연간 비교 접기" : "연간 비교 펼치기"}</button></div>{annual && (!data.annual_transactions ? <p role="status">연간 자료를 불러오는 중…</p> : <div className="table-scroll"><table className="report-table"><thead><tr>{["월", "수입", "소비지출", "저축·투자·원금상환", "남은 돈", "계획상 남은 돈"].map(title => <th key={title}>{title}</th>)}</tr></thead><tbody>{Array.from({ length: 12 }, (_, i) => { const m = month.slice(0, 4) + "-" + String(i + 1).padStart(2, "0"), a = summarize(data.annual_transactions!.filter(t => t.date.startsWith(m))), p = budgetSummary((data.annual_budgets ?? []).filter(b => b.month === m), data.categories); return <tr key={m} className={m === month ? "total-row" : ""}><th>{i + 1}월</th>{[a.income, a.expense, a.allocation, a.remaining, p.remaining].map((v, column) => <td key={column} className={"numeric" + (v < 0 ? " negative" : "")}>{money(v)}</td>)}</tr>; })}</tbody></table></div>)}</section>}
    <div className="dashboard-details">

      <details className="panel"><summary>{isRange ? "분류별 예정·확정 자세히 보기" : "분류별 계획과 실제 자세히 보기"}</summary><p className="muted">{isRange ? "선택 기간의 거래만 집계하며 예정과 확정을 구분해요." : "차이 = 계획 − 실제 · 환불은 원거래 분류에서 차감해요."}</p><div className="table-scroll"><table className="report-table"><thead><tr><th>유형 · 분류</th><th className="numeric">{isRange ? "미확정 예정" : "계획"}</th><th className="numeric">확정</th>{!isRange && <th className="numeric">차이</th>}</tr></thead><tbody>{categoryRows.map(c => <tr key={c.id}><th>{KINDS[c.kind]} · {c.major} / {c.minor}</th><td className="numeric">{money(isRange ? c.pending : c.plan)}</td><td className="numeric"><button className="number-link" onClick={() => onTransactions(undefined, "category:" + c.id)}>{money(c.actual)}</button></td>{!isRange && <td className={"numeric" + (c.plan - c.actual < 0 ? " negative" : "")}>{money(sumSafe(c.plan, -c.actual))}</td>}</tr>)}</tbody></table>{!categoryRows.length && <p className="empty">계획예산이나 확정 거래를 등록하면 비교할 수 있어요.</p>}</div></details>
      <details className="panel"><summary>고정비 전체 내역 보기 · {recurring.length}건</summary><div className="table-scroll"><table className="report-table"><thead><tr><th>항목</th><th>귀속</th><th>일자</th><th className="numeric">예정금액</th><th className="numeric">현재금액</th><th>상태</th></tr></thead><tbody>{recurring.map(t => <tr key={t.id}><th>{t.description}</th><td>{t.owner}</td><td>{t.date}</td><td className="numeric">{money(t.planned_amount ?? t.amount)}</td><td className="numeric">{money(t.amount)}</td><td><span className={"badge" + (t.status === "planned" ? " warning" : "")}>{STATUSES[t.status]}</span></td></tr>)}</tbody></table>{!recurring.length && <p className="empty">고정비 메뉴에서 반복 항목을 등록하세요.</p>}</div></details>
      {!isRange && <details className="panel budget-editor-details" id="budget-editor"><summary>이번 달 예산 설정·편집</summary><BudgetEditor data={data} month={month} onDirty={onDirty} onSaved={onSaved} /></details>}
      <details className="panel"><summary>최근 거래내역 보기</summary><div className="table-scroll"><table className="report-table"><thead><tr><th>날짜</th><th>귀속</th><th>내용</th><th>유형</th><th className="numeric">금액</th><th>상태</th></tr></thead><tbody>{[...data.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map(t => <tr key={t.id}><td>{t.date}</td><td>{t.owner}</td><th>{t.description}</th><td>{KINDS[t.kind]}</td><td className="numeric">{money(t.amount)}</td><td>{STATUSES[t.status]}</td></tr>)}</tbody></table>{!data.transactions.length && <p className="empty">저장된 거래가 없어요.</p>}</div></details>
    </div>
  </div>;
}
