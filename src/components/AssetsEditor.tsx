"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ASSET_KINDS, assetSummary, normalizeAsset, type Asset, type AssetForm, type AssetKind } from "@/lib/assets";
import { OWNERS, koreaDate, koreaDateTime, money, type LedgerData, type Owner } from "@/lib/domain";
import { postJson } from "@/lib/http";

function emptyForm(): AssetForm {
  return { id: crypto.randomUUID(), name: "", owner: "기타", kind: "deposit", basis_date: koreaDate(), balance: "", memo: "", version: 0 };
}
async function readAssets(signal?: AbortSignal): Promise<Asset[]> {
  const response = await fetch("/api/assets", { cache: "no-store", credentials: "same-origin", signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "자산·대출 내역을 조회하지 못했습니다.");
  if (!Array.isArray(result.assets)) throw new Error("자산·대출 응답을 확인하지 못했습니다.");
  return result.assets;
}
export default function AssetsEditor({ data, onDirty }: { data: LedgerData; onDirty: (scope: string, dirty: boolean) => void }) {
  const [rows, setRows] = useState<Asset[] | null>(null);
  const [form, setForm] = useState<AssetForm>(emptyForm);
  const [baseline, setBaseline] = useState(() => JSON.stringify(form));
  const [scope, setScope] = useState<Owner | "">("");
  const [saving, setSaving] = useState(false), [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const busy = useRef(false), request = useRef<{ fingerprint: string; id: string } | null>(null);
  const dirty = JSON.stringify(form) !== baseline;
  useEffect(() => { onDirty("assets", dirty); return () => onDirty("assets", false); }, [dirty, onDirty]);
  useEffect(() => { onDirty("busy:assets", saving); return () => onDirty("busy:assets", false); }, [saving, onDirty]);
  useEffect(() => {
    const controller = new AbortController();
    void readAssets(controller.signal).then(setRows).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "조회하지 못했습니다."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [data.family.id]);
  const update = (patch: Partial<AssetForm>) => { setForm(current => ({ ...current, ...patch })); setMessage(""); setError(""); };
  const reset = () => { const next = emptyForm(); setForm(next); setBaseline(JSON.stringify(next)); request.current = null; };
  const discard = () => !dirty || window.confirm("작성 중인 내용을 취소할까요?");
  const edit = (asset: Asset) => {
    if (busy.current || !discard()) return;
    const next: AssetForm = { id: asset.id, name: asset.name, owner: asset.owner, kind: asset.kind, basis_date: asset.basis_date, balance: asset.balance.toLocaleString("ko-KR"), memo: asset.memo, version: asset.version };
    setForm(next); setBaseline(JSON.stringify(next)); request.current = null; setMessage(""); setError("");
    document.getElementById("asset-name")?.focus();
  };
  const reload = async () => {
    if (busy.current || loading) return;
    setLoading(true); setError("");
    try { setRows(await readAssets()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "조회하지 못했습니다."); }
    finally { setLoading(false); }
  };
  const mutate = async (payload: { upserts: ReturnType<typeof normalizeAsset>[]; deletes: { id: string; version: number }[] }, resetForm: boolean) => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setMessage(""); setError("");
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    let committed = false;
    try {
      await postJson("/api/assets", { ...payload, request_id: request.current.id }); committed = true;
      setRows(await readAssets());
      if (resetForm) reset(); else request.current = null;
      setMessage(payload.deletes.length ? "항목을 삭제했습니다." : "자산·대출 잔액을 저장했습니다.");
    } catch (cause) {
      setError(committed ? "저장은 완료됐지만 조회에 실패했습니다. 같은 요청으로 다시 시도하세요." : cause instanceof Error ? cause.message : "저장하지 못했습니다.");
    } finally { busy.current = false; setSaving(false); }
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try { void mutate({ upserts: [normalizeAsset(form)], deletes: [] }, true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "입력을 확인하세요."); }
  };
  const remove = (asset: Asset) => {
    if (busy.current || dirty || !window.confirm(`‘${asset.name}’ 항목을 삭제할까요?`)) return;
    void mutate({ upserts: [], deletes: [{ id: asset.id, version: asset.version }] }, form.id === asset.id);
  };
  const visible = rows?.filter(row => !scope || row.owner === scope);
  const totals = visible ? assetSummary(visible) : null;
  return <div className="assets-view">
    <div className="section-heading"><div><h2>자산·대출 잔액 관리</h2><p>기준일의 잔액을 입력하고 변경될 때 수정하세요. 대출에는 남은 원금을 입력하세요.</p></div><span className="badge">현재 등록 잔액</span></div>
    <p className="muted asset-note">조회 월과 관계없이 최근에 등록한 잔액을 보여줍니다. 가계부 거래를 수정하면 잔액도 따로 갱신해 주세요.</p>
    <div className="view-toolbar"><label>귀속 필터 <select aria-label="자산 귀속 필터" value={scope} onChange={event => setScope(event.target.value as Owner | "")}><option value="">가족 전체</option>{OWNERS.map(owner => <option key={owner}>{owner}</option>)}</select></label><button onClick={() => void reload()} disabled={saving || loading}>최신 잔액 조회</button></div>
    {totals ? <div className="asset-metrics" aria-label="자산 합계"><div className="panel"><span>총자산</span><strong data-testid="asset-total">{money(totals.assets)}</strong></div><div className="panel"><span>대출 잔액</span><strong data-testid="loan-total">{money(totals.loans)}</strong></div><div className="panel"><span>순자산</span><strong data-testid="net-assets" className={totals.net < 0 ? "negative" : ""}>{money(totals.net)}</strong></div></div> : null}
    {error ? <p role="alert" className="notice error-notice">{error}</p> : null}
    {message ? <p role="status" className="notice">{message}</p> : null}
    {loading && !rows ? <p role="status">자산·대출 내역을 불러오는 중입니다…</p> : null}
    {rows ? <>
      <section className="panel"><div className="section-heading"><h2>{form.version ? "자산·대출 수정" : "자산·대출 등록"}</h2>{form.version ? <span className="badge">수정 중</span> : null}</div>
        <form onSubmit={save}><fieldset className="form-grid" disabled={saving}>
          <label>항목명<input id="asset-name" required maxLength={120} value={form.name} onChange={event => update({ name: event.target.value })} placeholder="예: 생활비 통장, 주택대출" /></label>
          <label>자산 종류<select aria-label="자산 종류" value={form.kind} onChange={event => update({ kind: event.target.value as AssetKind })}>{Object.entries(ASSET_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>귀속<select aria-label="귀속" value={form.owner} onChange={event => update({ owner: event.target.value as Owner })}>{OWNERS.map(owner => <option key={owner}>{owner}</option>)}</select></label>
          <label>잔액 (원)<input required inputMode="numeric" value={form.balance} onChange={event => update({ balance: event.target.value })} placeholder="0" /></label>
          <label>기준일<input required type="date" min="1900-01-01" max="9999-12-31" value={form.basis_date} onChange={event => update({ basis_date: event.target.value })} /></label>
          <label className="asset-memo">메모<input maxLength={500} value={form.memo} onChange={event => update({ memo: event.target.value })} /></label>
          <div className="form-actions"><button className="primary" disabled={saving || !dirty}>{saving ? "저장 중…" : form.version ? "수정 저장" : "자산·대출 등록"}</button><button type="button" onClick={() => { if (discard()) { reset(); setError(""); setMessage(""); } }} disabled={saving}>{form.version ? "수정 취소" : "입력 초기화"}</button></div>
        </fieldset></form>
      </section>
      <section className="panel"><div className="section-heading"><h2>등록 내역</h2><span className="badge">{visible?.length ?? 0}개</span></div>
        {visible?.length ? <div className="table-scroll"><table className="asset-table"><thead><tr><th>항목명</th><th>종류</th><th>귀속</th><th className="numeric">잔액</th><th>기준일</th><th>수정일 (한국시간)</th><th>관리</th></tr></thead><tbody>
          {visible.map(asset => <tr key={asset.id} data-asset-id={asset.id}><th scope="row">{asset.name}{asset.memo ? <small className="asset-row-memo">{asset.memo}</small> : null}</th><td>{ASSET_KINDS[asset.kind]}</td><td>{asset.owner}</td><td className="numeric">{money(asset.balance)}</td><td>{asset.basis_date}</td><td><time dateTime={asset.updated_at}>{koreaDateTime(asset.updated_at)}</time></td><td className="asset-actions"><button aria-label={`${asset.name} 수정`} onClick={() => edit(asset)} disabled={saving || asset.accounting !== "manual"}>수정</button><button aria-label={`${asset.name} 삭제`} onClick={() => remove(asset)} disabled={saving || dirty}>삭제</button></td></tr>)}
        </tbody></table></div> : <p className="empty">{scope ? "이 귀속에 등록된 항목이 없습니다." : "등록한 자산·대출이 없습니다. 첫 잔액을 등록해 주세요."}</p>}
      </section>
    </> : null}
  </div>;
}
