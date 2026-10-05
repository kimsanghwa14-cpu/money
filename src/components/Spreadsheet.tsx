"use client";
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { OWNERS, KINDS, STATUSES, koreaDateTime, blankRow, fromDraft, money, parseAmount, sumSafe, toDraft, validateDraft, exportCsv, type Draft, type LedgerData, type Owner, type Transaction, type CellErrors } from "@/lib/domain";
import { COLUMNS, categoryParts, cellText, pasteRows, type ColumnKey } from "@/lib/grid";
import { HttpError, postJson } from "@/lib/http";
type Props = { data: LedgerData; month: string; owner?: Owner; onDirty: (scope: string, dirty: boolean) => void; onSaved: () => Promise<void>; initialFilter?: string; defaultDate?: string; exportLabel?: string };
const PAGE_SIZE = 200;
export function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type })), link = document.createElement("a");
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Spreadsheet({ data, month, owner, onDirty, onSaved, initialFilter = "", defaultDate, exportLabel }: Props) {
  const canViewModificationDates = data.permissions?.view_modification_dates === true;
  const savedRows = useMemo(() => data.transactions.filter(t => !owner || t.owner === owner), [data.transactions, owner]);
  const [baseline, setBaseline] = useState(savedRows);
  const [rows, setRows] = useState<Draft[]>(savedRows.map(toDraft));
  const [deletes, setDeletes] = useState<{ id: string; version: number }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState(""), [status, setStatus] = useState(["planned", "plannedOut"].includes(initialFilter) ? "planned" : initialFilter ? "confirmed" : ""), [kind, setKind] = useState(initialFilter === "planned" || initialFilter.startsWith("category:") ? "" : initialFilter);
  const [category, setCategory] = useState(initialFilter.startsWith("category:") ? initialFilter.slice(9) : ""), [method, setMethod] = useState(""), [sort, setSort] = useState("date-asc"), [extras, setExtras] = useState(false);
  const [saving, setSaving] = useState(false), [message, setMessage] = useState(""), [attempted, setAttempted] = useState(false), [page, setPage] = useState(0);
  const [serverErrors, setServerErrors] = useState<Record<string, CellErrors>>({});
  const [conflicts, setConflicts] = useState<Transaction[]>([]);
  const tableRef = useRef<HTMLDivElement>(null), busy = useRef(false), revealId = useRef<string | null>(null);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const columns = COLUMNS.filter(c => extras || !["memo", "target_account_id", "original_transaction_id"].includes(c.key));
  const baseMap = useMemo(() => new Map(baseline.map(r => [r.id, toDraft(r)])), [baseline]);
  const changed = useMemo(() => rows.filter(r => !baseMap.has(r.id) || JSON.stringify(r) !== JSON.stringify(baseMap.get(r.id))), [rows, baseMap]);
  const dirty = changed.length > 0 || deletes.length > 0;
  useEffect(() => { onDirty("grid", dirty); return () => onDirty("grid", false); }, [dirty, onDirty]);
  useEffect(() => { onDirty("busy:grid", saving); return () => onDirty("busy:grid", false); }, [saving, onDirty]);
  useEffect(() => { if (!dirty) { setRows(savedRows.map(toDraft)); setBaseline(savedRows); } }, [savedRows, dirty]);
  const errors = useMemo(() => Object.fromEntries(rows.map(r => [r.id, { ...validateDraft(r, data.categories, data.methods, data.accounts), ...serverErrors[r.id] }])), [rows, data, serverErrors]);
  const visible = useMemo(() => rows.filter(r => (!search || `${r.description} ${r.memo}`.toLowerCase().includes(search.toLowerCase())) && (!status || r.status === status) && (!kind || (kind === "plannedOut" ? ["expense", "saving", "loan_principal"].includes(r.kind) : kind === "allocation" ? ["saving", "loan_principal"].includes(r.kind) : kind === "balance" ? ["income", "expense", "refund", "saving", "loan_principal"].includes(r.kind) : kind === "consumption" ? ["income", "expense", "refund"].includes(r.kind) : kind === "expense" ? ["expense", "refund"].includes(r.kind) : r.kind === kind)) && (!category || r.category_id === category) && (!method || r.payment_method_id === method)).sort((a, b) => {
    const direction = sort.endsWith("desc") ? -1 : 1;
    if (sort.startsWith("amount")) return (Number(a.amount.replaceAll(",", "")) - Number(b.amount.replaceAll(",", ""))) * direction;
    return a.date.localeCompare(b.date) * direction;
  }), [rows, search, status, kind, category, method, sort]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE)), currentPage = Math.min(page, pages - 1), pageStart = currentPage * PAGE_SIZE;
  const pageRows = visible.slice(pageStart, pageStart + PAGE_SIZE);
  useEffect(() => { setPage(0); }, [search, status, kind, category, method, sort]);
  useEffect(() => {
    const id = revealId.current;
    if (!id) return;
    const index = visible.findIndex(row => row.id === id);
    if (index < 0) return;
    revealId.current = null; setPage(Math.floor(index / PAGE_SIZE));
    requestAnimationFrame(() => { const cell = tableRef.current?.querySelector<HTMLElement>(`[data-id="${id}"][data-col="0"]`); cell?.focus(); cell?.scrollIntoView({ block: "nearest" }); });
  }, [visible]);
  let total = 0, amountErrors = 0;
  for (const row of visible) { try { total = sumSafe(total, parseAmount(row.amount)); } catch { amountErrors++; } }
  const update = (id: string, patch: Partial<Draft>) => {
    setRows(current => current.map(r => r.id === id ? { ...r, ...patch } : r));
    setServerErrors(current => { const next = { ...current }; delete next[id]; return next; }); setMessage(""); setConflicts([]);
  };
  const makeRow = () => {
    const row = blankRow(owner ?? "", defaultDate?.slice(0, 7) ?? month, data.categories);
    return defaultDate ? { ...row, date: defaultDate } : row;
  };
  const addRows = (n: number) => {
    if (changed.length + deletes.length + n > 1000) { setMessage("한 번에 저장할 변경사항은 1,000행 이내입니다. 먼저 저장하세요."); return; }
    setSearch(""); setStatus(""); setKind(""); setCategory(""); setMethod("");
    const added = Array.from({ length: n }, makeRow);
    revealId.current = added[0]?.id ?? null;
    setRows(current => [...current, ...added]);
    return added[0]?.id;
  };
  const move = (event: KeyboardEvent, r: number, c: number) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.key !== "Enter" && event.key !== "Tab") return;
    event.preventDefault();
    let nextR = r, nextC = c;
    if (event.key === "Enter") nextR += event.shiftKey ? -1 : 1;
    else { nextC += event.shiftKey ? -1 : 1; if (nextC >= columns.length) { nextC = 0; nextR++; } if (nextC < 0) { nextC = columns.length - 1; nextR--; } }
    if (nextR < 0) return;
    const addedId = nextR >= visible.length ? addRows(1) : undefined;
    if (!addedId && nextR < visible.length) setPage(Math.floor(nextR / PAGE_SIZE));
    requestAnimationFrame(() => tableRef.current?.querySelector<HTMLElement>(addedId ? `[data-id="${addedId}"][data-col="${nextC}"]` : `[data-row="${nextR}"][data-col="${nextC}"]`)?.focus());
  };
  const paste = (event: ClipboardEvent, row: Draft, columnIndex: number) => {
    const text = event.clipboardData.getData("text/plain"); if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();
    try {
      const pasted = pasteRows(visible, text, visible.findIndex(r => r.id === row.id), columnIndex, columns.map(c => c.key), owner ?? "", defaultDate?.slice(0, 7) ?? month, data.categories, data.methods, data.accounts);
      // Only supply a new-row default when the pasted range does not include the date column.
      const dateNotPasted = columnIndex > columns.findIndex(column => column.key === "date");
      const next = pasted.map(r => defaultDate && dateNotPasted && !rows.some(old => old.id === r.id) ? { ...r, date: defaultDate } : r);
      const map = new Map(next.map(r => [r.id, r]));
      setRows(current => [...current.map(r => map.get(r.id) ?? r), ...next.filter(r => !current.some(old => old.id === r.id))]);
      setServerErrors({}); setAttempted(true); setMessage(`${next.length - visible.length}개의 새 행을 포함해 붙여넣었습니다. 저장 전 귀속·분류를 확인하세요.`);
    } catch (e) { setMessage((e as Error).message); }
  };
  const copy = (recent = false) => {
    const originals = recent ? [...baseline].sort((a, b) => b.created_at?.localeCompare(a.created_at ?? "") ?? b.date.localeCompare(a.date)).slice(0, 1).map(toDraft) : rows.filter(r => selected.has(r.id));
    if (changed.length + deletes.length + originals.length > 1000) { setMessage("한 번에 저장할 변경사항은 1,000행 이내입니다."); return; }
    const added = originals.map(r => ({ ...r, id: crypto.randomUUID(), version: 0, date: recent ? defaultDate ?? blankRow(owner ?? "기타", month, data.categories).date : r.date,
      owner: recent ? owner ?? r.owner : r.owner, recurrence_rule_id: null, planned_amount: null, source_id: null, source_namespace: null, created_by: undefined, updated_by: undefined, created_at: undefined, updated_at: undefined }));
    revealId.current = added[0]?.id ?? null;
    setRows(current => [...current, ...added]);
    setSearch(""); setStatus(""); setKind(""); setCategory(""); setMethod("");
  };
  const deleteRows = () => {
    setDeletes(current => [...current, ...rows.filter(r => selected.has(r.id) && baseMap.has(r.id)).map(r => ({ id: r.id, version: r.version }))]);
    setRows(current => current.filter(r => !selected.has(r.id))); setSelected(new Set()); setConflicts([]);
  };
  const cancel = () => {
    if (!dirty || window.confirm("저장하지 않은 변경사항을 모두 취소할까요?")) { setRows(baseline.map(toDraft)); setDeletes([]); setSelected(new Set()); setMessage(""); setAttempted(false); setServerErrors({}); setConflicts([]); }
  };
  const save = async () => {
    if (busy.current || !dirty) return;
    setAttempted(true); setMessage("");
    if (changed.length + deletes.length > 1000) { setMessage("한 번에 저장할 변경사항은 1,000행 이내입니다."); return; }
    if (changed.some(r => Object.keys(errors[r.id]).length > 0)) { if (changed.some(r => errors[r.id]?.target_account_id || errors[r.id]?.original_transaction_id || errors[r.id]?.memo)) setExtras(true); setMessage("오류가 있는 셀을 수정하세요. 어떤 행도 저장하지 않았습니다."); return; }
    const payload = { upserts: changed, deletes }; const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint) request.current = { id: crypto.randomUUID(), fingerprint };
    busy.current = true; setSaving(true); let committed = false;
    try {
      const result = await postJson("/api/transactions", { ...payload, request_id: request.current!.id }); committed = true;
      await onSaved();
      setDeletes([]); setRows(current => current.map(r => ({ ...r, version: changed.some(c => c.id === r.id) ? r.version + 1 : r.version })));
      setBaseline(rows.map(r => ({ ...fromDraft(r), version: changed.some(c => c.id === r.id) ? r.version + 1 : r.version })));
      setMessage(`${result.saved}건의 변경사항을 DB에 저장했습니다. 조회 기간 밖으로 이동한 내역은 전체 내역에서 확인하세요.`); setSelected(new Set()); setAttempted(false); setConflicts([]);
    } catch (e) {
      if (e instanceof HttpError && e.details.errors) setServerErrors(e.details.errors as Record<string, CellErrors>);
      setMessage(committed ? "DB 저장은 완료됐지만 최신 내역 조회에 실패했습니다. 입력을 보존했습니다. 같은 내용으로 다시 저장하면 중복 없이 조회를 재시도합니다." : (e as Error).message);
    } finally { busy.current = false; setSaving(false); }
  };
  const compare = async () => {
    try {
      const ids = [...new Set([...changed.filter(row => row.version > 0), ...deletes].map(row => row.id))];
      const latest: Transaction[] = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const params = new URLSearchParams({ month, ids: ids.slice(offset, offset + 100).join(",") });
        const response = await fetch(`/api/ledger?${params}`, { cache: "no-store", credentials: "same-origin" });
        const result = await response.json(); if (!response.ok) throw new Error(result.error);
        if (!Array.isArray(result.transactions)) throw new Error("비교할 거래를 조회하지 못했습니다.");
        latest.push(...result.transactions);
      }
      setConflicts(latest.filter(r => changed.some(d => d.id === r.id && d.version !== r.version) || deletes.some(d => d.id === r.id && d.version !== r.version)));
      setMessage("날짜가 다른 기간으로 이동한 내역도 ID로 비교했습니다. 선택하기 전에는 덮어쓰지 않습니다. 삭제된 내역은 입력을 백업한 후 변경 취소·새로고침하세요.");
    } catch (e) { setMessage((e as Error).message); }
  };
  function resolveConflict(server: Transaction, keepMine: boolean) {
    setBaseline(current => [...current.filter(r => r.id !== server.id), server]);
    if (deletes.some(r => r.id === server.id)) {
      if (keepMine) setDeletes(current => current.map(r => r.id === server.id ? { ...r, version: server.version } : r));
      else { setDeletes(current => current.filter(r => r.id !== server.id)); setRows(current => [...current, toDraft(server)]); }
    } else setRows(current => current.map(r => r.id === server.id ? keepMine ? { ...r, version: server.version } : toDraft(server) : r));
    setConflicts(current => current.filter(r => r.id !== server.id));
  }
  const exportVisible = () => {
    if (visible.some(r => Object.keys(errors[r.id]).length)) { setMessage("표에 오류가 있어 CSV로 내보낼 수 없습니다. 입력 백업(JSON)을 사용하세요."); return; }
    download(exportCsv(visible.map(fromDraft), data.categories, data.methods, data.accounts), `가계부-${exportLabel ?? month}-${owner ?? "전체"}.csv`, "text/csv;charset=utf-8");
  };
  const cell = (row: Draft, key: ColumnKey, rowIndex: number, colIndex: number) => {
    const errKey = key === "major" || key === "minor" ? "category_id" : key;
    const error = (attempted || row.version > 0) ? errors[row.id]?.[errKey] : undefined;
    const base = baseMap.get(row.id), edited = !base || cellText(base, key, data.categories, data.methods, data.accounts) !== cellText(row, key, data.categories, data.methods, data.accounts);
    const common = { "aria-label": `${rowIndex + 1}행 ${COLUMNS.find(c => c.key === key)?.label}`, "aria-invalid": !!error,
      "aria-describedby": error ? `err-${row.id}-${key}` : undefined, "data-row": rowIndex, "data-col": colIndex, "data-id": row.id,
      onKeyDown: (e: KeyboardEvent) => move(e, rowIndex, colIndex), onPaste: (e: ClipboardEvent) => paste(e, row, colIndex), disabled: saving };
    let input;
    if (key === "cost_type" || key === "owner" || key === "kind" || key === "status" || key === "payment_method_id" || key === "account_id" || key === "target_account_id" || key === "major" || key === "minor") {
      const kindCategories = data.categories.filter(c => c.kind === (row.kind === "refund" ? "expense" : row.kind));
      const [major, minor] = categoryParts(row, data.categories);
      const options = key === "cost_type" ? [["fixed", "고정비"], ["variable", "변동비"]] : key === "owner" ? OWNERS.map(v => [v, v]) : key === "kind" ? Object.entries(KINDS) : key === "status" ? Object.entries(STATUSES) : key === "payment_method_id" ? data.methods.map(m => [m.id, m.name]) : key === "account_id" || key === "target_account_id" ? data.accounts.map(a => [a.id, a.name]) : key === "major" ? [...new Set(kindCategories.map(c => c.major))].map(v => [v, v]) : kindCategories.filter(c => c.major === major).map(c => [c.minor, c.minor]);
      const value = key === "major" ? major : key === "minor" ? minor : row[key] ?? "";
      input = <select {...common} disabled={saving || (key === "cost_type" && row.kind !== "expense")} value={value} onChange={e => {
        const v = e.target.value;
        if (key === "kind") { if (["refund", "transfer", "settlement"].includes(v)) setExtras(true); update(row.id, { kind: v as Draft["kind"], category_id: data.categories.find(c => c.kind === (v === "refund" ? "expense" : v))?.id ?? "", original_transaction_id: null, cost_type: v === "expense" ? row.cost_type : null }); }
        else if (key === "major") update(row.id, { category_id: kindCategories.find(c => c.major === v)?.id ?? "" });
        else if (key === "minor") update(row.id, { category_id: kindCategories.find(c => c.major === major && c.minor === v)?.id ?? "" });
        else update(row.id, { [key]: v || ((key.endsWith("_id") || key === "cost_type") ? null : "") });
      }}>
        <option value="">{key === "owner" ? "귀속 확인" : key === "cost_type" ? row.kind === "refund" ? "원거래 기준" : row.recurrence_rule_id ? "고정비 (반복규칙)" : "구분 미지정" : "선택"}</option>
        {value && !options.some(([v]) => v === value) && <option value={value}>미확정: {value}</option>}
        {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>;
    } else input = <input {...common} type="text" value={String(row[key] ?? "")} placeholder={key === "date" ? "YYYY-MM-DD" : key === "amount" ? "0" : ""} inputMode={key === "amount" ? "numeric" : undefined} className={key === "amount" ? "number-input" : ""} onChange={e => update(row.id, { [key]: e.target.value })} onBlur={() => { if (key === "amount") { try { update(row.id, { amount: parseAmount(row.amount).toLocaleString("ko-KR") }); } catch { /* Keep invalid input for correction. */ } } }} />;
    return <td key={key} className={`${edited ? "edited" : ""} ${error ? "cell-error" : ""}`} style={{ minWidth: COLUMNS.find(c => c.key === key)?.width }}>{key === "description" && row.recurrence_rule_id && <span className="recurring-tag sheet-recurring-tag">고정비</span>}{input}{error && <span className="cell-message" id={`err-${row.id}-${key}`}>! {error}</span>}</td>;
  };
  return <section className="sheet-section">
    <div className="section-heading"><div><h2>{owner ? `${owner} 거래원장` : "전체 거래원장"}</h2><p>월을 나누지 않고 선택 기간의 내역을 함께 편집합니다. 날짜는 실제 거래일을 입력하세요.</p></div><span className={dirty ? "badge warning" : "badge"}>{dirty ? `미저장 ${changed.length}행 · 삭제 ${deletes.length}행` : "DB 저장 내역"}</span></div>
    <div className="sheet-legend"><span className="recurring-tag">고정비</span><span>연한 노란 행은 고정비·반복거래입니다.</span><span className="edited-legend">수정한 셀은 주황색 테두리로 표시합니다.</span></div>
    <div className="sheet-toolbar">
      <button onClick={() => addRows(1)} disabled={saving}>+ 행 추가</button><button onClick={() => addRows(10)} disabled={saving}>10행 추가</button>
      <button onClick={() => copy()} disabled={!selected.size || saving}>선택 복사</button><button onClick={deleteRows} disabled={!selected.size || saving}>선택 삭제</button>
      <button onClick={() => copy(true)} disabled={!baseline.length || saving}>최근 내역 재사용</button>
      <label className="check-label"><input type="checkbox" checked={extras} onChange={e => setExtras(e.target.checked)} /> 보조 열</label>
      <div className="toolbar-spacer" /><button onClick={cancel} disabled={!dirty || saving}>변경 취소</button>
      <button className="primary" onClick={save} disabled={!dirty || saving}>{saving ? "저장 중…" : "변경사항 저장"}</button>
    </div>
    <div className="filters">
      <input aria-label="내용 검색" placeholder="기간 내 전체 내용·메모 검색" value={search} onChange={e => setSearch(e.target.value)} />
      <select aria-label="거래유형 필터" value={kind} onChange={e => setKind(e.target.value)}><option value="">모든 거래유형</option><option value="plannedOut">예정 지출·배분 대상</option><option value="allocation">저축·투자 + 원금상환</option><option value="balance">자금배분 집계 대상</option><option value="consumption">소비 집계 대상</option>{Object.entries(KINDS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select aria-label="분류 필터" value={category} onChange={e => setCategory(e.target.value)}><option value="">모든 분류</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.major} / {c.minor}</option>)}</select>
      <select aria-label="결제수단 필터" value={method} onChange={e => setMethod(e.target.value)}><option value="">모든 결제수단</option>{data.methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      <select aria-label="상태 필터" value={status} onChange={e => setStatus(e.target.value)}><option value="">모든 상태</option>{Object.entries(STATUSES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select aria-label="정렬" value={sort} onChange={e => setSort(e.target.value)}><option value="date-asc">날짜 오름차순</option><option value="date-desc">날짜 내림차순</option><option value="amount-asc">금액 오름차순</option><option value="amount-desc">금액 내림차순</option></select>
    </div>
    {message && <div className="notice" role="status">{message}{dirty && <><button onClick={compare} disabled={saving}>최신 내역 비교</button><button onClick={() => download(JSON.stringify({ month, period: exportLabel, rows, deletes }, null, 2), `미저장입력-${exportLabel ?? month}.json`, "application/json")}>입력 백업(JSON)</button></>}</div>}
    {conflicts.map(server => <div className="conflict" key={server.id}><strong>{server.description}</strong><p>DB: {server.date} · {server.owner} · {money(server.amount)} · 버전 {server.version}</p><p>입력: {rows.find(r => r.id === server.id)?.description ?? "삭제 예정"} · {rows.find(r => r.id === server.id)?.amount ?? ""}</p><button onClick={() => resolveConflict(server, false)}>DB 내역 사용</button><button onClick={() => resolveConflict(server, true)}>내 변경을 새 버전에 적용</button></div>)}
    {pages > 1 ? <div className="view-toolbar"><button aria-label="이전 거래 페이지" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전</button><span>{currentPage + 1} / {pages} 페이지 · 필터와 합계는 전체 {visible.length.toLocaleString("ko-KR")}행 기준</span><button aria-label="다음 거래 페이지" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>다음</button><span>선택 {selected.size}행</span></div> : null}
    <div className="table-scroll ledger-table" ref={tableRef}><table><thead><tr><th className="row-selector"><input aria-label="현재 페이지 행 전체 선택" type="checkbox" checked={pageRows.length > 0 && pageRows.every(r => selected.has(r.id))} onChange={e => setSelected(current => { const next = new Set(current); for (const row of pageRows) { if (e.target.checked) next.add(row.id); else next.delete(row.id); } return next; })} /></th><th className="row-number">행</th>{columns.map(c => <Fragment key={c.key}><th style={{ minWidth: c.width }}>{c.label}</th>{c.key === "amount" && canViewModificationDates ? <th>수정일 (한국시간)</th> : null}</Fragment>)}<th>예정금액</th><th>거래ID·수정 이력</th></tr></thead><tbody>
      {pageRows.map((row, localIndex) => { const index = pageStart + localIndex; return <tr key={row.id} data-recurring={row.recurrence_rule_id ? "true" : undefined} className={[row.version === 0 ? "new-row" : "", row.recurrence_rule_id ? "recurring-row" : ""].filter(Boolean).join(" ")}><td className="row-selector"><input aria-label={`${index + 1}행 선택`} type="checkbox" checked={selected.has(row.id)} onChange={e => setSelected(current => { const next = new Set(current); if (e.target.checked) next.add(row.id); else next.delete(row.id); return next; })} /></td><td className="row-number">{row.version === 0 ? "＋" : index + 1}</td>{columns.map((c, i) => <Fragment key={c.key}>{cell(row, c.key, index, i)}{c.key === "amount" && canViewModificationDates ? <td className="meta-cell updated-cell" data-testid="transaction-updated-at" data-transaction-id={row.id}><time dateTime={row.updated_at}>{row.version === 0 ? "저장 전" : koreaDateTime(row.updated_at)}</time></td> : null}</Fragment>)}<td className="numeric meta-cell">{row.planned_amount === null ? "—" : money(row.planned_amount)}</td><td className="meta-cell"><code>{row.id}</code><span>생성 {data.members?.find(m=>m.user_id===row.created_by)?.display_name ?? row.created_by ?? "저장 전"}<br />수정 {data.members?.find(m=>m.user_id===row.updated_by)?.display_name ?? row.updated_by ?? "저장 전"} · 버전 {row.version}</span></td></tr>; })}
    </tbody></table>{visible.length === 0 && <div className="empty"><strong>{rows.length ? "조건에 맞는 거래가 없습니다." : "이 기간의 첫 거래를 입력하세요."}</strong><p>행 추가 후 입력하거나, 날짜 셀에 엑셀의 여러 행을 붙여넣을 수 있습니다.</p><button onClick={() => addRows(1)}>+ 첫 행 추가</button></div>}</div>
    <div className="sheet-footer"><span>조건에 맞는 {visible.length}행 / 전체 {rows.length}행 · 현재 페이지 {pageRows.length}행 · Tab으로 다음 셀, Enter로 다음 행</span><strong>{amountErrors ? `합계 계산 불가 · 금액 오류 ${amountErrors}행` : `필터 전체 금액 합계 ${money(total)}`}</strong><button onClick={exportVisible} disabled={!visible.length}>필터 전체 CSV</button></div>
  </section>;
}
