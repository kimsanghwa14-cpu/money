"use client";
import { useRef, useState, type FormEvent } from "react";
import { browserClient } from "@/lib/supabase/client";
import { usernameEmail, validateSignup } from "@/lib/auth/input";

export default function SignupForm() {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const pending = useRef(false);
  async function signup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || created) return;
    setMessage("");
    if (password !== confirmation) { setMessage("비밀번호 확인이 일치하지 않습니다."); return; }
    let input;
    try { input = validateSignup({ username, displayName, password, code }); }
    catch (error) { setMessage(error instanceof Error ? error.message : "가입 정보를 확인하세요."); return; }
    pending.current = true;
    setBusy(true);
    try {
      const db = browserClient();
      const { data, error } = await db.functions.invoke("money-signup", { body: input });
      if (error) {
        let errorMessage = "회원가입하지 못했습니다. 잠시 후 다시 시도하세요.";
        if (error.context instanceof Response) {
          const result = await error.context.json().catch(() => null);
          if (typeof result?.error === "string") errorMessage = result.error;
        }
        setMessage(errorMessage);
        return;
      }
      if (data?.created !== true) throw new Error("가입 결과를 확인하지 못했습니다. 로그인 화면에서 계정을 확인하세요.");
      setCreated(true);
      setPassword(""); setConfirmation(""); setCode("");
      const result = await db.auth.signInWithPassword({ email: usernameEmail(input.username), password: input.password });
      if (result.error) { setMessage("회원가입이 완료되었습니다. 로그인 화면에서 아이디와 비밀번호로 로그인하세요."); return; }
      window.location.assign("/");
    } catch (error) { setMessage(error instanceof Error ? error.message : "회원가입하지 못했습니다. 잠시 후 다시 시도하세요."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <form onSubmit={event => void signup(event)} className="login-form" aria-busy={busy}>
    <label>아이디<input required name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={24} aria-describedby="signup-username-help" value={username} onChange={event => setUsername(event.target.value)} disabled={created} /></label>
    <small id="signup-username-help" className="field-help">영문·숫자·밑줄 3~24자. 대소문자는 구분하지 않습니다.</small>
    <label>이름<input required name="displayName" autoComplete="name" maxLength={30} value={displayName} onChange={event => setDisplayName(event.target.value)} disabled={created} /></label>
    <label>비밀번호<input required name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} aria-describedby="signup-password-help" value={password} onChange={event => setPassword(event.target.value)} disabled={created} /></label>
    <small id="signup-password-help" className="field-help">8자 이상 입력하세요.</small>
    <label>비밀번호 확인<input required name="passwordConfirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={created} /></label>
    <label>회원가입 코드<input required name="signupCode" type="password" autoComplete="off" maxLength={128} value={code} onChange={event => setCode(event.target.value)} disabled={created} /></label>
    <p className="muted">가족에게 받은 회원가입 코드를 입력하세요.</p>
    {message ? <p role={created ? "status" : "alert"} className="notice">{message}</p> : null}
    <button className="primary" disabled={busy || created}>{busy ? "가입 처리 중…" : created ? "가입 완료" : "회원가입"}</button>
    <p className="auth-switch">이미 계정이 있나요? <a href="/login">로그인</a></p>
  </form>;
}
