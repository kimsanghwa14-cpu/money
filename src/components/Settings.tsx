"use client";
import { useEffect,useRef,useState } from "react";
import { KINDS,type LedgerData } from "@/lib/domain";
import { postJson } from "@/lib/http";
import { browserClient } from "@/lib/supabase/client";
export default function Settings({data,onSaved,onDirty}:{data:LedgerData;onSaved:()=>Promise<void>;onDirty:(scope:string,dirty:boolean)=>void}){
  const [type,setType]=useState("account"),[name,setName]=useState(""),[kind,setKind]=useState("bank"),[major,setMajor]=useState(""),[minor,setMinor]=useState(""),[message,setMessage]=useState(""),[saving,setSaving]=useState(false);
  const request=useRef<{fingerprint:string;id:string}|null>(null);
  const [password,setPassword]=useState(""),[confirmation,setConfirmation]=useState(""),[passwordMessage,setPasswordMessage]=useState(""),[passwordError,setPasswordError]=useState(false),[changingPassword,setChangingPassword]=useState(false);
  const passwordRequest=useRef(false);
  useEffect(()=>{onDirty("password",!!password||!!confirmation);return()=>onDirty("password",false);},[password,confirmation,onDirty]);
  useEffect(()=>{onDirty("busy:password",changingPassword);return()=>onDirty("busy:password",false);},[changingPassword,onDirty]);
  const changePassword=async()=>{
    if(passwordRequest.current)return;
    setPasswordMessage("");setPasswordError(true);
    if(password!==confirmation){setPasswordMessage("새 비밀번호 확인이 일치하지 않습니다.");return;}
    if(password.length<8||new TextEncoder().encode(password).length>72){setPasswordMessage("새 비밀번호는 8자 이상, 72바이트 이하로 입력하세요.");return;}
    passwordRequest.current=true;setChangingPassword(true);
    try{
      const {data:updated,error}=await browserClient().auth.updateUser({password});
      if(error){
        const code=error.code;
        if(code==="reauthentication_needed"||code==="reauthentication_not_valid"||code==="current_password_invalid")throw new Error("추가 본인 확인이 필요해 비밀번호를 변경하지 못했습니다. 로그아웃하지 말고 관리자에게 재설정을 요청하세요.");
        if(code==="same_password")throw new Error("기존 비밀번호와 다른 새 비밀번호를 입력하세요.");
        if(code==="weak_password")throw new Error("더 긴 비밀번호에 영문, 숫자, 기호를 함께 사용하세요.");
        throw new Error("비밀번호를 변경하지 못했습니다. 로그인 상태와 연결을 확인한 뒤 다시 시도하세요.");
      }
      if(!updated.user)throw new Error("비밀번호 변경 결과를 확인하지 못했습니다. 다시 시도하세요.");
      setPassword("");setConfirmation("");setPasswordError(false);setPasswordMessage("비밀번호를 변경했습니다. 다음 로그인부터 새 비밀번호를 사용하세요.");
    }catch(error){setPasswordMessage(error instanceof Error?error.message:"비밀번호를 변경하지 못했습니다. 다시 시도하세요.");}
    finally{passwordRequest.current=false;setChangingPassword(false);}
  };
  const dirty=!!name||!!major||!!minor;useEffect(()=>{onDirty("settings",dirty);return()=>onDirty("settings",false);},[dirty,onDirty]);
  useEffect(()=>{onDirty("busy:settings",saving);return()=>onDirty("busy:settings",false);},[saving,onDirty]);
  const save=async()=>{if(saving)return;setSaving(true);let committed=false;try{const payload={type,item:type==="category"?{kind,major,minor}:{name,kind}};const fingerprint=JSON.stringify(payload);if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,id:crypto.randomUUID()};await postJson("/api/settings",{...payload,request_id:request.current!.id});committed=true;await onSaved();setName("");setMajor("");setMinor("");request.current=null;setMessage("설정을 DB에 저장했습니다.");}catch(e){setMessage(committed?"설정 저장은 완료됐지만 조회에 실패했습니다. 같은 내용으로 재시도하세요.":(e as Error).message);}finally{setSaving(false);}};
  return <><section className="panel"><div className="section-heading"><h2>가족 · 연결 정보</h2><span className="badge success">✓ 인증된 DB 연결</span></div><dl className="details"><dt>가족</dt><dd>{data.family.name}</dd><dt>로그인 사용자</dt><dd>{data.member.display_name}</dd><dt>권한</dt><dd>{data.member.role==="owner"?"가족 관리자":"가족 구성원"}</dd><dt>기록 귀속</dt><dd>상화 / 하율 / 기타 — 누가 로그인했는지와 별개</dd><dt>데이터 저장</dt><dd>Supabase 서버 DB · 가족 단위 RLS · 원자적 일괄 저장</dd></dl><p className="muted">가족 계정 승인·초대는 Supabase 관리 화면과 DB 설정으로 진행합니다. 앱에서 누구나 가입할 수 없도록 구성했습니다.</p></section>
    <section className="panel"><div className="section-heading"><h2>비밀번호 변경</h2></div><p className="muted" id="password-help">현재 로그인한 계정의 새 비밀번호를 설정하세요. 8자 이상 입력하세요.</p><form onSubmit={e=>{e.preventDefault();void changePassword();}}><fieldset className="form-grid" disabled={changingPassword}><label>새 비밀번호<input required name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={72} aria-describedby="password-help" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>새 비밀번호 확인<input required name="newPasswordConfirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label><div className="form-actions"><button className="primary" disabled={changingPassword}>{changingPassword?"변경 중…":"비밀번호 변경"}</button></div></fieldset></form>{passwordMessage&&<p className={passwordError?"notice error-notice":"notice"} role={passwordError?"alert":"status"}>{passwordMessage}</p>}</section>
    <section className="panel"><div className="section-heading"><h2>계좌·카드 / 결제수단 / 분류 등록</h2></div><form onSubmit={e=>{e.preventDefault();void save();}}><fieldset className="form-grid" disabled={saving}><label>등록 항목<select value={type} onChange={e=>{setType(e.target.value);setKind(e.target.value==="category"?"expense":"bank");}}><option value="account">계좌·카드</option><option value="method">결제수단</option><option value="category">분류</option></select></label>{type!=="category"?<label>명칭<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>:<><label>대분류<input required maxLength={80} value={major} onChange={e=>setMajor(e.target.value)}/></label><label>소분류<input required maxLength={80} value={minor} onChange={e=>setMinor(e.target.value)}/></label></>}{type==="account"&&<label>종류<select value={kind} onChange={e=>setKind(e.target.value)}><option value="bank">은행계좌</option><option value="card">카드</option><option value="asset">저축·투자계좌</option><option value="loan">대출계좌</option></select></label>}{type==="category"&&<label>거래유형<select value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(KINDS).filter(([k])=>k!=="refund").map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>}<div className="form-actions"><button className="primary" disabled={saving}>{saving?"저장 중…":"등록"}</button></div></fieldset></form>{message&&<p className="notice" role="status">{message}</p>}</section>
    <div className="dashboard-columns"><section className="panel"><h2>등록된 계좌·카드</h2>{data.accounts.length?<ul className="reference-list">{data.accounts.map(a=><li key={a.id}>{a.name}<span className="badge">{{bank:"은행",card:"카드",asset:"저축·투자",loan:"대출"}[a.kind]}</span></li>)}</ul>:<p className="empty">사용할 계좌·카드를 먼저 등록하세요.</p>}</section><section className="panel"><h2>결제수단</h2><ul className="reference-list">{data.methods.map(m=><li key={m.id}>{m.name}</li>)}</ul></section></div>
    <section className="panel"><h2>등록된 분류</h2><div className="reference-grid">{data.categories.map(c=><span className="badge" key={c.id}>{KINDS[c.kind]} · {c.major} / {c.minor}</span>)}</div></section>
  </>;
}
