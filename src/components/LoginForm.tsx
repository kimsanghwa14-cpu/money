"use client";
import {useState} from "react";
import {browserClient} from "@/lib/supabase/client";
export default function LoginForm(){
  const[email,setEmail]=useState(""),[password,setPassword]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const login=async(link=false)=>{if(busy)return;setBusy(true);setMessage("");try{const db=browserClient();const {error}=link?await db.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:`${process.env.NEXT_PUBLIC_SITE_URL??window.location.origin}/auth/callback`}}):await db.auth.signInWithPassword({email,password});if(error)throw error;if(link)setMessage("등록된 이메일로 로그인 링크를 요청했습니다. 이메일을 확인하세요.");else window.location.assign("/");}catch{setMessage("로그인하지 못했습니다. 승인된 이메일·비밀번호와 인증 서버 연결을 확인하세요.");}finally{setBusy(false);}};
  return <form onSubmit={e=>{e.preventDefault();void login();}} className="login-form"><label>이메일<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>비밀번호<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?"인증 중…":"로그인"}</button><button type="button" disabled={busy||!email} onClick={()=>void login(true)}>이메일로 로그인 링크 받기</button>{message&&<p role="status" className="notice">{message}</p>}<p className="muted">승인된 가족 계정만 이용할 수 있습니다. 공개 회원가입은 제공하지 않습니다.</p></form>;
}
