"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { summarize,money,exportCsv,monthRange,type LedgerData,type Owner } from "@/lib/domain";
import { browserClient } from "@/lib/supabase/client";
import Spreadsheet,{download} from "./Spreadsheet";
import Dashboard from "./Dashboard";
import RecurringEditor from "./RecurringEditor";
import Settings from "./Settings";
import AssetsEditor from "./AssetsEditor";
type Tab="dashboard"|"상화"|"하율"|"transactions"|"recurring"|"assets"|"settings";
const titles:Record<Tab,string>={dashboard:"집계표",상화:"상화 가계부",하율:"하율 가계부",transactions:"거래원장",recurring:"고정비",assets:"자산·대출",settings:"설정"};
export default function LedgerApp({initialMonth}:{initialMonth:string}){
  const [tab,setTab]=useState<Tab>("dashboard"),[month,setMonth]=useState(initialMonth),[annual,setAnnual]=useState(false),[data,setData]=useState<LedgerData|null>(null);
  const [error,setError]=useState(""),[loading,setLoading]=useState(true),[scopes,setScopes]=useState<Record<string,boolean>>({});
  const [owner,setOwner]=useState<Owner|undefined>(),[filter,setFilter]=useState(""),[gridKey,setGridKey]=useState(0),[signingOut,setSigningOut]=useState(false);
  const hasDirty=Object.values(scopes).some(Boolean);const dirtyRef=useRef(hasDirty);dirtyRef.current=hasDirty;
  const viewRef=useRef(`${month}/${annual}`);viewRef.current=`${month}/${annual}`;
  const onDirty=useCallback((scope:string,dirty:boolean)=>setScopes(current=>current[scope]===dirty?current:{...current,[scope]:dirty}),[]);
  useEffect(()=>{const handler=(event:BeforeUnloadEvent)=>{if(dirtyRef.current){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);},[]);
  const permissionToLeave=()=>{if(Object.entries(scopes).some(([scope,busy])=>scope.startsWith("busy:")&&busy)){window.alert("DB에 저장 중입니다. 완료될 때까지 기다려 주세요.");return false;}return !hasDirty||window.confirm("저장하지 않은 변경사항이 있습니다. 변경사항을 취소하고 이동할까요?");};
  const fetchData=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch(`/api/ledger?month=${month}${annual?"&annual=1":""}`,{cache:"no-store",signal});
    const result=await response.json();if(!response.ok)throw new Error(result.error??"DB 조회에 실패했습니다.");return result as LedgerData;
  },[month,annual]);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError("");setData(null);setScopes({});fetchData(controller.signal).then(setData).catch(e=>{if(!controller.signal.aborted)setError((e as Error).message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[fetchData]);
  const refresh=useCallback(async()=>{const view=`${month}/${annual}`;try{const next=await fetchData();if(viewRef.current===view){setData(next);setError("");}}catch(e){if(viewRef.current===view)setError((e as Error).message);throw e;}},[fetchData,month,annual]);
  const navigate=(next:Tab)=>{if(tab===next||!permissionToLeave())return;setScopes({});setTab(next);setOwner(undefined);setFilter("");setGridKey(k=>k+1);};
  const openTransactions=(o?:Owner,f="")=>{if(!permissionToLeave())return;setScopes({});setOwner(o);setFilter(f);setTab("transactions");setGridKey(k=>k+1);};
  const changeMonth=(next:string)=>{if(next!==month&&permissionToLeave()){setMonth(next);setScopes({});setGridKey(k=>k+1);}};
  const moveMonth=(direction:number)=>{const [y,m]=month.split("-").map(Number);const date=new Date(Date.UTC(y,m-1+direction,1));changeMonth(`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`);};
  const signOut=async()=>{if(signingOut||!permissionToLeave())return;setSigningOut(true);try{const {error}=await browserClient().auth.signOut();if(error)throw error;window.location.assign("/login");}catch{setError("로그아웃에 실패했습니다. 다시 시도하세요.");setSigningOut(false);}};
  const summary=data?summarize(data.transactions):null;
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">₩</span><div><strong>리온이네 가계부</strong><small>상화 · 하율</small></div></div><div className="nav-label">월별 기록</div><nav aria-label="가계부 메뉴">{(["dashboard","상화","하율"] as Tab[]).map((t,i)=><button key={t} className={tab===t?"nav-active":""} aria-current={tab===t?"page":undefined} onClick={()=>navigate(t)}><span className="nav-symbol">{["▦","상","하"][i]}</span>{titles[t]}</button>)}<button className={tab==="transactions"?"nav-active":""} onClick={()=>openTransactions("기타")}><span className="nav-symbol">기</span>기타 · 전체 내역</button><div className="nav-label">관리</div>{(["recurring","assets","settings"] as Tab[]).map((t,i)=><button key={t} className={tab===t?"nav-active":""} onClick={()=>navigate(t)}><span className="nav-symbol">{["↻","▤","⚙"][i]}</span>{titles[t]}</button>)}</nav><div className="sidebar-foot"><span className="badge">한국시간 · 원화</span><p>예정과 확정을 구분하고<br/>하나의 원장에서 함께 기록합니다.</p>{data&&<><strong>{data.member.display_name}</strong><button onClick={signOut} disabled={signingOut}>{signingOut?"로그아웃 중…":"로그아웃"}</button></>}</div></aside>
  <main className="main-content"><header className="page-header"><div><div className="eyebrow">{data?.family.name??"가족 가계부"}</div><h1>{titles[tab]}</h1></div><div className="header-actions"><div className="month-picker"><button aria-label="이전 달" onClick={()=>moveMonth(-1)} disabled={month==="1900-01"}>‹</button><input aria-label="조회 연월" type="month" min="1900-01" max="9998-12" value={month} onChange={e=>{if(e.target.value)changeMonth(e.target.value);}}/><button aria-label="다음 달" onClick={()=>moveMonth(1)} disabled={month==="9998-12"}>›</button></div><button disabled={!data} onClick={()=>{if(data)download(exportCsv(data.transactions,data.categories,data.methods,data.accounts),`가계부-${month}.csv`,"text/csv;charset=utf-8");}}>CSV 내보내기</button></div></header>
    <div className="period-info"><span>{monthRange(month)[0]}부터 해당 월 말일까지</span><span>{loading?"DB 조회 중…":data?"✓ 가족 DB 연결":"! DB 내역을 불러오지 못했습니다"}{hasDirty?" · 미저장 변경사항 있음":""}</span></div>
    {error&&<div className="notice error-notice" role="alert">{error}<button onClick={()=>{if(!hasDirty||window.confirm("입력을 유지하면서 최신 내역을 조회합니다. 계속할까요?"))void refresh().catch(()=>{});}}>연결·조회 재시도</button></div>}
    {loading?<div className="loading" role="status"><span className="spinner"/>가족 거래원장을 불러오는 중입니다.</div>:data?<>
      {tab==="dashboard"&&<Dashboard key={month} data={data} month={month} onDirty={onDirty} onSaved={refresh} onTransactions={openTransactions} annual={annual} setAnnual={value=>{if(value!==annual&&permissionToLeave())setAnnual(value);}}/>}
      {(tab==="상화"||tab==="하율"||tab==="transactions")&&<><div className="compact-summary"><span>실제 수입 <strong>{money(summarize(data.transactions,tab==="transactions"?owner:tab as Owner).income)}</strong></span><span>소비지출 <strong>{money(summarize(data.transactions,tab==="transactions"?owner:tab as Owner).expense)}</strong></span><span>저축·투자·상환 <strong>{money(summarize(data.transactions,tab==="transactions"?owner:tab as Owner).allocation)}</strong></span><span>계산상 여유자금 <strong>{money(summarize(data.transactions,tab==="transactions"?owner:tab as Owner).remaining)}</strong></span></div>{tab==="transactions"&&<div className="view-toolbar"><span>귀속</span>{[undefined,"상화","하율","기타"].map(o=><button key={o??"전체"} className={owner===o?"primary":""} onClick={()=>{if(permissionToLeave()){setOwner(o as Owner|undefined);setScopes({});setGridKey(k=>k+1);}}}>{o??"전체"}</button>)}</div>}<Spreadsheet key={`${month}-${tab}-${gridKey}`} data={data} month={month} owner={tab==="transactions"?owner:tab as Owner} initialFilter={filter} onDirty={onDirty} onSaved={refresh}/></>}
      {tab==="recurring"&&<RecurringEditor key={month} data={data} month={month} onSaved={refresh} onDirty={onDirty}/>}{tab==="assets"&&<AssetsEditor key={data.family.id} data={data} onDirty={onDirty}/>}{tab==="settings"&&<Settings data={data} onSaved={refresh} onDirty={onDirty}/>}
    </>:<section className="panel empty"><h2>현재 DB 내역을 표시할 수 없습니다.</h2><p>Supabase 설정·가족 승인·마이그레이션을 확인한 뒤 다시 조회하세요. 데이터를 임의로 생성하거나 저장 성공으로 표시하지 않습니다.</p></section>}
    <footer className="app-footer"><span>예정 거래는 실제 실적에서 제외 · 내부이체와 카드대금 정산은 중복 집계하지 않음</span>{summary&&<span>확정 기준 계산상 여유자금 {money(summary.remaining)}</span>}</footer>
  </main></div>;
}
