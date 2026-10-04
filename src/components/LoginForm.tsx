"use client";
import { useRef, useState, type FormEvent } from "react";
import { browserClient } from "@/lib/supabase/client";
import { usernameEmail } from "@/lib/auth/input";
export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      const email = usernameEmail(username);
      const { error } = await browserClient().auth.signInWithPassword({ email, password });
      if (error) { setMessage("아이디 또는 비밀번호를 확인하세요."); return; }
      window.location.assign("/");
    } catch (error) { setMessage(error instanceof Error ? error.message : "로그인하지 못했습니다. 잠시 후 다시 시도하세요."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <form onSubmit={event => void login(event)} className="login-form" aria-busy={busy}>
    <label>아이디<input required name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={24} value={username} onChange={event => setUsername(event.target.value)} /></label>
    <label>비밀번호<input required name="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
    <button className="primary" disabled={busy}>{busy ? "로그인 중…" : "로그인"}</button>
    {message ? <p role="alert" className="notice">{message}</p> : null}
    <p className="auth-switch">아직 계정이 없나요? <a href="/signup">회원가입</a></p>
    <p className="muted">회원가입 코드가 있는 가족만 가입할 수 있습니다.</p>
  </form>;
}
