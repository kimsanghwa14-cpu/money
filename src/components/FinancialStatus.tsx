"use client";
import { useEffect, useState } from "react";
import { assetSummary, ASSET_KINDS, type Asset } from "@/lib/assets";
import { money, sumSafe } from "@/lib/domain";
import { parseAssetSnapshot, type AssetSnapshot, type ForecastRow } from "@/lib/asset-snapshot";

function PlanTable({ title, rows, changeLabel }: { title: string; rows: ForecastRow[]; changeLabel: string }) {
  const sum = (key: "starting_balance" | "change" | "projected_balance") => rows.reduce((n, row) => sumSafe(n, row[key]), 0);
  return <div><h3>{title}</h3><div className="table-scroll"><table className="report-table">
    <thead><tr><th>항목</th><th className="numeric">원본 기존 금액</th><th className="numeric">{changeLabel}</th><th className="numeric">계획 잔액</th><th>원본 메모</th></tr></thead>
    <tbody>{rows.map((row, i) => <tr key={`${row.name}-${i}`}><th>{row.name}</th><td className="numeric">{money(row.starting_balance)}</td><td className="numeric">{money(row.change)}</td><td className="numeric">{money(row.projected_balance)}</td><td>{row.note || "—"}</td></tr>)}
      <tr className="total-row"><th>합계</th>{(["starting_balance", "change", "projected_balance"] as const).map(key => <td key={key} className="numeric">{money(sum(key))}</td>)}<td>원본 계획 · 실적 아님</td></tr></tbody>
  </table></div></div>;
}
export default function FinancialStatus({ familyId }: { familyId: string }) {
  const [result, setResult] = useState<{ assets: Asset[]; snapshot: AssetSnapshot | null } | null>(null);
  const [error, setError] = useState(""), [revision, setRevision] = useState(0), [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setResult(null);
    void (async () => {
      try {
        const response = await fetch("/api/assets?include_snapshot=1", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "자산 현황을 조회하지 못했습니다.");
        if (!Array.isArray(body.assets)) throw new Error("자산 현황 응답을 확인하지 못했습니다.");
        const snapshot = body.asset_snapshot ? parseAssetSnapshot(body.asset_snapshot) : null;
        if (!controller.signal.aborted) setResult({ assets: body.assets, snapshot });
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "자산 현황을 조회하지 못했습니다.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [familyId, revision]);
  const totals = result ? assetSummary(result.assets) : null;
  const groups = result ? [
    { title: "대출 현황", rows: result.assets.filter(row => row.kind === "loan") },
    { title: "투자·기타 자산 현황", rows: result.assets.filter(row => ["investment", "stock", "other"].includes(row.kind)) },
    { title: "저축·예금·연금 현황", rows: result.assets.filter(row => ["deposit", "bank_deposit", "savings", "cash", "pension"].includes(row.kind)) },
  ] : [];
  // A pending row leaves this notice only after its reserved ID has actually been registered.
  const pending = result?.snapshot?.pending_assets.filter(row => !result.assets.some(asset => asset.id === row.id)) ?? [];
  const snapshot = result?.snapshot;
  const balances = (kinds: string[]) => result?.assets.filter(row => kinds.includes(row.kind)).reduce((n, row) => sumSafe(n, row.balance), 0) ?? 0;
  const legacy = result?.assets.filter(row => row.kind === "deposit" || row.kind === "investment") ?? [];
  return <section className="panel" aria-label="대출·투자·저축 현황" data-testid="financial-status">
    <div className="section-heading"><div><h2>현재 우리 집 재정상황</h2><p>최근 등록 잔액입니다. 선택한 월의 수입·지출 실적과 별도로 관리합니다.</p></div>
      <button onClick={() => setRevision(n => n + 1)} disabled={loading}>최신 현황 조회</button></div>
    {loading ? <p role="status">잔액과 원본 계획을 불러오는 중…</p> : null}
    {error ? <p role="alert" className="notice error-notice">{error}</p> : null}
    {totals ? <><div className="financial-headline"><div className="financial-net"><span>우리 집 순자산</span><strong data-testid="dashboard-net-assets">{money(totals.net)}</strong><small>총자산 − 총부채</small></div><div className="financial-totals"><div><span>총자산</span><strong data-testid="dashboard-asset-total">{money(totals.assets)}</strong></div><div><span>총부채</span><strong data-testid="dashboard-loan-total">{money(totals.loans)}</strong></div></div></div>
      <div className="financial-breakdown">{[{label:"적금", kinds:["savings"]}, {label:"예금", kinds:["bank_deposit"]}, {label:"주식", kinds:["stock"]}, {label:"현금·기타 금융자산", kinds:["cash","other","pension"]}].map(group => <div key={group.label}><span>{group.label}</span><strong>{result?.assets.some(row => group.kinds.includes(row.kind)) ? money(balances(group.kinds)) : "분류된 항목 없음"}</strong></div>)}</div>
      {legacy.length ? <div className="financial-legacy"><strong>기존 분류 자산 · 총자산에 포함</strong><div><span>예금·현금 (세부 분류 전)</span><strong>{money(balances(["deposit"]))}</strong></div><div><span>투자 (세부 분류 전)</span><strong>{money(balances(["investment"]))}</strong></div><p>기존 자산을 이름으로 추정하지 않습니다. ‘자산·대출’에서 종류를 확인해 적금·예금·주식·현금으로 선택하면 위 항목에 자동 반영됩니다.</p></div> : null}
      {!result?.assets.length ? <p className="muted">등록된 자산·부채가 없습니다. ‘자산·대출’에서 잔액을 등록하세요.</p> : null}</> : null}
    {pending.length ? <div className="notice" role="status"><strong>미등록 · 확인 필요 — 위 합계에서 제외</strong>
      {pending.map(row => <p key={row.id}>{row.name} {money(row.balance)} · {row.reason}</p>)}</div> : null}
    {snapshot ? <p className="muted">자료: {snapshot.source_label} · 등록일 {snapshot.received_date} · {snapshot.source_basis_date ? `원본 잔액 기준일 ${snapshot.source_basis_date}` : "원본 잔액 기준일 미기재. 등록일을 관리용 기준일로 사용한 항목은 실제 잔액 확인일과 다릅니다."}</p> : null}
    <details className="financial-detail"><summary>자산·부채 내역과 원본 자금계획 보기</summary>
    {groups.map(group => <div key={group.title}><div className="section-heading"><h3>{group.title}</h3><span className="badge">{money(group.rows.reduce((n, row) => sumSafe(n, row.balance), 0))}</span></div>
      {group.rows.length ? <div className="table-scroll"><table className="report-table"><thead><tr><th>항목</th><th>귀속</th><th>종류</th><th className="numeric">등록 잔액</th><th>관리 기준일</th></tr></thead><tbody>
        {group.rows.map(row => <tr key={row.id}><th>{row.name}{row.memo ? <small className="asset-row-memo">{row.memo}</small> : null}</th><td>{row.owner}</td><td>{ASSET_KINDS[row.kind]}</td><td className="numeric">{money(row.balance)}</td><td>{row.basis_date}</td></tr>)}
      </tbody></table></div> : <p className="empty">등록된 항목이 없습니다.</p>}</div>)}
    {snapshot ? <details open><summary><strong>{snapshot.forecast.month.replace("-", "년 ")}월 원본 자금계획</strong></summary>
      <p className="muted">아래는 업로드 자료에 적힌 예상액입니다. 현재 자산·대출이나 실제 수입·지출에 합산하지 않습니다. 잔액을 수정해도 이 원본 계획은 자동 재계산되지 않습니다.</p>
      {snapshot.forecast.loans.length ? <PlanTable title="대출 상환 계획" rows={snapshot.forecast.loans} changeLabel="상환 예정액" /> : null}
      {snapshot.forecast.savings.length ? <PlanTable title="저축 계획" rows={snapshot.forecast.savings} changeLabel="추가 저축 예정액" /> : null}
    </details> : null}
    </details>
    <p className="muted">잔액 수정·삭제는 ‘자산·대출’ 메뉴에서 할 수 있습니다. 은행·증권사 잔액의 실시간 조회가 아닙니다.</p>
  </section>;
}
