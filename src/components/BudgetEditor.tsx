"use client";
import { useEffect, useRef, useState } from "react";
import { OWNERS, KINDS, parseAmount, type Budget, type LedgerData, type Owner } from "@/lib/domain";
import { postJson } from "@/lib/http";
type BudgetDraft = Omit<Budget, "amount"> & { amount: string };
export default function BudgetEditor({ data, month, onDirty, onSaved }: { data: LedgerData; month: string; onDirty: (scope: string, dirty: boolean) => void; onSaved: () => Promise<void> }) {
  const [rows, setRows] = useState<BudgetDraft[]>(data.budgets.map(b => ({ ...b, amount: b.amount.toLocaleString("ko-KR") })));
  const [baseline, setBaseline] = useState(JSON.stringify(rows));
  const [message, setMessage] = useState(""), [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({}); const busy = useRef(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const dirty = JSON.stringify(rows) !== baseline;
  useEffect(() => { onDirty("budgets", dirty); return () => onDirty("budgets", false); }, [dirty, onDirty]);
  useEffect(() => { onDirty("busy:budgets", saving); return () => onDirty("busy:budgets", false); }, [saving, onDirty]);
  useEffect(() => { if (!dirty) { const next = data.budgets.map(b => ({ ...b, amount: b.amount.toLocaleString("ko-KR") })); setRows(next); setBaseline(JSON.stringify(next)); } }, [data.budgets, dirty]);
  const categories = data.categories.filter(c => ["income", "expense", "saving", "loan_principal"].includes(c.kind));
  const patch = (id: string, value: Partial<BudgetDraft>) => { setRows(current => current.map(r => r.id === id ? { ...r, ...value } : r)); setMessage(""); };
  const save = async () => {
    if (busy.current || !dirty) return;
    const invalid: Record<string, string> = {};
    for (const r of rows) { try { parseAmount(r.amount, true); if (!r.category_id) throw new Error("분류를 선택하세요."); if (r.label.length > 120) throw new Error("메모는 120자 이내로 입력하세요."); } catch(e) { invalid[r.id] = (e as Error).message; } }
    setErrors(invalid); if (Object.keys(invalid).length) { setMessage("오류를 수정하세요. 예산은 아직 저장되지 않았습니다."); return; }
    const fingerprint = JSON.stringify(rows); if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    busy.current = true; setSaving(true); let committed = false;
    try {
      await postJson("/api/budgets", { request_id: request.current!.id, budgets: rows }); committed = true; await onSaved();
      const next = rows.map(r => ({ ...r, version: r.version + 1 })); setRows(next); setBaseline(JSON.stringify(next)); setMessage("이 달의 계획예산을 저장했습니다. 실제 거래에는 포함되지 않습니다.");
    } catch(e) { setMessage(committed ? "DB 저장은 완료됐지만 조회에 실패했습니다. 같은 내용으로 재시도하세요." : (e as Error).message); }
    finally { busy.current = false; setSaving(false); }
  };
  return <section className="panel"><div className="section-heading"><div><h2>월별 계획예산 · 잉여자금 배분</h2><p>{month} 적용 · 급여·생활비·경조사·추가 적금 등을 계획합니다. 실제 실적과 별도로 저장됩니다.</p></div><button className="primary" disabled={!dirty || saving} onClick={save}>{saving ? "저장 중…" : "예산 저장"}</button></div>
    {message && <p role="status" className="notice">{message}</p>}
    <div className="table-scroll"><table className="budget-table"><thead><tr><th>귀속</th><th>유형 · 분류</th><th className="numeric">계획금액</th><th>계획 메모</th><th>오류</th></tr></thead><tbody>{rows.map((r,i) => <tr key={r.id}><td><select disabled={saving} aria-label={`예산 ${i+1}행 귀속`} value={r.owner} onChange={e => patch(r.id,{owner:e.target.value as Owner})}>{OWNERS.map(o => <option key={o}>{o}</option>)}</select></td><td><select disabled={saving} aria-label={`예산 ${i+1}행 분류`} value={r.category_id} onChange={e => patch(r.id,{category_id:e.target.value})}><option value="">분류 선택</option>{categories.map(c => <option key={c.id} value={c.id}>{KINDS[c.kind]} · {c.major} / {c.minor}</option>)}</select></td><td><input disabled={saving} className="number-input" aria-label={`예산 ${i+1}행 금액`} inputMode="numeric" value={r.amount} onChange={e => patch(r.id,{amount:e.target.value})}/></td><td><input disabled={saving} aria-label={`예산 ${i+1}행 메모`} value={r.label} onChange={e => patch(r.id,{label:e.target.value})} placeholder="생일·명절·추가 적금 등" /></td><td className="error-text">{errors[r.id]}</td></tr>)}</tbody></table>{!rows.length && <p className="empty">아직 계획예산이 없습니다. 예산은 거래를 자동 확정하지 않습니다.</p>}</div>
    <div className="sheet-footer"><button disabled={saving} onClick={() => setRows(current => [...current,{id:crypto.randomUUID(),month,owner:"기타",category_id:categories[0]?.id??"",amount:"0",label:"",version:0}])}>+ 예산 행 추가</button><span>예산을 없애려면 금액을 0원으로 변경하세요.</span><button disabled={!dirty || saving} onClick={() => { if(window.confirm("예산 변경사항을 취소할까요?")){ const next=data.budgets.map(b=>({...b,amount:b.amount.toLocaleString("ko-KR")}));setRows(next);setBaseline(JSON.stringify(next));setErrors({}); } }}>변경 취소</button></div>
  </section>;
}
