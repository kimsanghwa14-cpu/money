"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { summarize, money, exportCsv, koreaDate, type Owner } from "@/lib/domain";
import { entryDate, initialPeriod, ledgerUrl, periodDates, periodFileLabel, periodTitle, resolvePeriod, type PeriodLedgerData, type PeriodSelection } from "@/lib/periods";
import { browserClient } from "@/lib/supabase/client";
import Spreadsheet, { download } from "./Spreadsheet";
import Dashboard from "./Dashboard";
import RangeDashboard from "./RangeDashboard";
import PeriodControls from "./PeriodControls";
import RecurringEditor from "./RecurringEditor";
import Settings from "./Settings";
import AssetsEditor from "./AssetsEditor";

type Tab = "dashboard" | "상화" | "하율" | "transactions" | "recurring" | "assets" | "settings";
const titles: Record<Tab,string> = { dashboard:"집계표", 상화:"상화 가계부", 하율:"하율 가계부", transactions:"거래원장", recurring:"고정비", assets:"자산·대출", settings:"설정" };
export default function PeriodLedgerApp({ initialMonth }: { initialMonth: string }) {
  const [tab,setTab]=useState<Tab>("dashboard"), [selection,setSelection]=useState<PeriodSelection>(()=>{
    const today=koreaDate(); return initialPeriod(today.startsWith(initialMonth)?today:`${initialMonth}-21`);
  }), [annual,setAnnual]=useState(false), [data,setData]=useState<PeriodLedgerData|null>(null);
  const [error,setError]=useState(""), [loading,setLoading]=useState(true), [scopes,setScopes]=useState<Record<string,boolean>>({});
  const [owner,setOwner]=useState<Owner|undefined>(), [filter,setFilter]=useState(""), [gridKey,setGridKey]=useState(0), [signingOut,setSigningOut]=useState(false);
  const hasDirty=Object.values(scopes).some(Boolean), dirtyRef=useRef(hasDirty); dirtyRef.current=hasDirty;
  const period=resolvePeriod(selection,annual), queryUrl=ledgerUrl(selection,annual), viewRef=useRef(queryUrl); viewRef.current=queryUrl;
  const onDirty=useCallback((scope:string,dirty:boolean)=>setScopes(current=>current[scope]===dirty?current:{...current,[scope]:dirty}),[]);
  useEffect(()=>{ const handler=(event:BeforeUnloadEvent)=>{ if(dirtyRef.current){event.preventDefault();event.returnValue="";} }; window.addEventListener("beforeunload",handler); return()=>window.removeEventListener("beforeunload",handler); },[]);
  const permissionToLeave=()=>{
    if(Object.entries(scopes).some(([scope,busy])=>scope.startsWith("busy:")&&busy)){window.alert("DB에 저장 중입니다. 완료될 때까지 기다려 주세요.");return false;}
    return !hasDirty||window.confirm("저장하지 않은 변경사항이 있습니다. 변경사항을 취소하고 이동할까요?");
  };
  const fetchData=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch(queryUrl,{cache:"no-store",credentials:"same-origin",signal});
    const result=await response.json(); if(!response.ok)throw new Error(result.error??"DB 조회에 실패했습니다.");
    if(!result.period||!Array.isArray(result.transactions))throw new Error("조회 기간 응답을 확인하지 못했습니다. 새로고침해 주세요.");
    return result as PeriodLedgerData;
  },[queryUrl]);
  useEffect(()=>{ const controller=new AbortController(); setLoading(true); setError(""); setData(null); setScopes({});
    void fetchData(controller.signal).then(next=>{if(!controller.signal.aborted)setData(next);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"조회에 실패했습니다.");}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[fetchData]);
  const refresh=useCallback(async()=>{const view=queryUrl;try{const next=await fetchData();if(viewRef.current===view){setData(next);setError("");}}catch(cause){if(viewRef.current===view)setError(cause instanceof Error?cause.message:"조회에 실패했습니다.");throw cause;}},[fetchData,queryUrl]);
  const changePeriod=(next:PeriodSelection,nextAnnual:boolean)=>{
    try { resolvePeriod(next,nextAnnual); } catch(cause){setError(cause instanceof Error?cause.message:"기간을 확인하세요.");return false;}
    if(ledgerUrl(next,nextAnnual)===queryUrl)return true;
    if(!permissionToLeave())return false;
    setScopes({});setSelection(next);setAnnual(nextAnnual);setGridKey(n=>n+1);setData(null);setLoading(true);return true;
  };
  const navigate=(next:Tab)=>{if(tab===next||!permissionToLeave())return;setScopes({});setTab(next);setOwner(undefined);setFilter("");setGridKey(n=>n+1);};
  const openTransactions=(target?:Owner,nextFilter="")=>{if(!permissionToLeave())return;setScopes({});setOwner(target);setFilter(nextFilter);setTab("transactions");setGridKey(n=>n+1);};
  const signOut=async()=>{if(signingOut||!permissionToLeave())return;setSigningOut(true);try{const {error}=await browserClient().auth.signOut();if(error)throw error;window.location.assign("/login");}catch{setError("로그아웃에 실패했습니다. 다시 시도하세요.");setSigningOut(false);}};
  const summary=data?summarize(data.transactions):null, ledgerTab=["dashboard","상화","하율","transactions"].includes(tab);
  const transactionOwner=tab==="transactions"?owner:tab==="상화"||tab==="하율"?tab:undefined;
  const personal=data?summarize(data.transactions,transactionOwner):null;
  // Recurrence revision months remain real calendar months, not payroll labels.
  const managementMonth=selection.mode==="calendar"?selection.month:selection.month>koreaDate().slice(0,7)?selection.month:koreaDate().slice(0,7);
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">₩</span><div><strong>리온이네 가계부</strong><small>상화 · 하율</small></div></div><div className="nav-label">기간별 기록</div><nav aria-label="가계부 메뉴">
    {(["dashboard","상화","하율"] as Tab[]).map((target,index)=><button key={target} className={tab===target?"nav-active":""} aria-current={tab===target?"page":undefined} onClick={()=>navigate(target)}><span className="nav-symbol">{["▦","상","하"][index]}</span>{titles[target]}</button>)}
    <button className={tab==="transactions"?"nav-active":""} onClick={()=>openTransactions("기타")}><span className="nav-symbol">기</span>기타 · 전체 내역</button><div className="nav-label">관리</div>
    {(["recurring","assets","settings"] as Tab[]).map((target,index)=><button key={target} className={tab===target?"nav-active":""} onClick={()=>navigate(target)}><span className="nav-symbol">{["↻","▤","⚙"][index]}</span>{titles[target]}</button>)}
    </nav><div className="sidebar-foot"><span className="badge">급여주기 21일~20일</span><p>거래일은 그대로 두고<br/>조회 기간을 바꾸어 기록합니다.</p>{data?<><strong>{data.member.display_name}</strong><button onClick={signOut} disabled={signingOut}>{signingOut?"로그아웃 중…":"로그아웃"}</button></>:null}</div></aside>
    <main className="main-content"><header className="page-header"><div><div className="eyebrow">{data?.family.name??"가족 가계부"}</div><h1>{titles[tab]}</h1></div>{ledgerTab?<div className="header-actions"><button disabled={!data} onClick={()=>{if(data)download(exportCsv(data.transactions,data.categories,data.methods,data.accounts),`가계부-${periodFileLabel(period)}.csv`,"text/csv;charset=utf-8");}}>기간 전체 CSV</button></div>:null}</header>
      {ledgerTab?<PeriodControls value={selection} annual={annual} onChange={changePeriod}/>:null}
      <div className="period-info"><span>{ledgerTab?`${periodTitle(period)} · ${periodDates(period)}`:tab==="recurring"?`규칙 변경 적용월: ${managementMonth} · 실제 달력의 일자 기준`:"선택한 거래 기간과 무관한 가족 공통 정보"}</span><span>{loading?"DB 조회 중…":data?"✓ 가족 DB 연결":"! DB 내역 조회 실패"}{hasDirty?" · 미저장 변경사항 있음":""}</span></div>
      {error?<div className="notice error-notice" role="alert">{error}<button onClick={()=>{if(!hasDirty||window.confirm("입력을 유지하면서 최신 내역을 조회합니다. 계속할까요?"))void refresh().catch(()=>{});}}>연결·조회 재시도</button></div>:null}
      {loading?<div className="loading" role="status"><span className="spinner"/>거래원장을 불러오는 중입니다.</div>:data?<>
        {tab==="dashboard"?(selection.mode==="calendar"?<Dashboard key={queryUrl} data={data} month={selection.month} onDirty={onDirty} onSaved={refresh} onTransactions={openTransactions} annual={annual} setAnnual={value=>{changePeriod(selection,value);}}/>:<RangeDashboard data={data} onTransactions={openTransactions}/>):null}
        {(tab==="상화"||tab==="하율"||tab==="transactions")?<>
          {personal?<div className="compact-summary"><span>확정 수입 <strong>{money(personal.income)}</strong></span><span>소비지출 <strong>{money(personal.expense)}</strong></span><span>저축·투자·상환 <strong>{money(personal.allocation)}</strong></span><span>계산상 여유자금 <strong>{money(personal.remaining)}</strong></span></div>:null}
          {tab==="transactions"?<div className="view-toolbar"><span>귀속</span>{[undefined,"상화","하율","기타"].map(target=><button key={target??"전체"} className={owner===target?"primary":""} onClick={()=>{if(permissionToLeave()){setOwner(target as Owner|undefined);setScopes({});setGridKey(n=>n+1);}}}>{target??"전체"}</button>)}</div>:null}
          <Spreadsheet key={`${queryUrl}-${tab}-${gridKey}`} data={data} month={selection.month} owner={transactionOwner} initialFilter={filter} defaultDate={entryDate(period)} exportLabel={periodFileLabel(period)} onDirty={onDirty} onSaved={refresh}/>
        </>:null}
        {tab==="recurring"?<RecurringEditor key={managementMonth} data={data} month={managementMonth} onSaved={refresh} onDirty={onDirty}/>:null}
        {tab==="assets"?<AssetsEditor key={data.family.id} data={data} onDirty={onDirty}/>:null}
        {tab==="settings"?<Settings data={data} onSaved={refresh} onDirty={onDirty}/>:null}
      </>:<section className="panel empty"><h2>현재 DB 내역을 표시할 수 없습니다.</h2><p>연결·조회 재시도로 다시 확인하세요. 실패한 조회 결과를 임의의 금액으로 표시하지 않습니다.</p></section>}
      <footer className="app-footer"><span>예정 거래는 실제 실적에서 제외 · 내부이체와 카드정산 중복 제외</span>{summary&&ledgerTab?<span>선택 기간의 확정 여유자금 {money(summary.remaining)}</span>:null}</footer>
    </main></div>;
}
