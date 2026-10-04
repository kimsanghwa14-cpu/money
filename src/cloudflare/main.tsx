import { Component, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import LedgerApp from "../components/LedgerApp";
import LoginPage from "../app/login/page";
import SignupPage from "../app/signup/page";
import SetupNotice from "../components/SetupNotice";
import { configured } from "../lib/supabase/config";
import { koreaDate } from "../lib/domain";
import "../app/globals.css";

function Failure({ message }: { message: string }) {
  return <main className="setup-page"><section className="setup-card">
    <h1>가계부에 연결하지 못했습니다.</h1>
    <p role="alert">{message}</p>
    <button onClick={() => window.location.reload()}>다시 시도</button>{" "}
    <a href="/login">로그인 화면으로</a>
  </section></main>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <Failure message="화면을 불러오지 못했습니다. 새로고침한 뒤 다시 시도하세요." /> : this.props.children;
  }
}

function App() {
  const [state, setState] = useState<{ ready: boolean; error?: string }>({ ready: false });
  const isLogin = window.location.pathname === "/login";
  const isSignup = window.location.pathname === "/signup";
  const isAuthPage = isLogin || isSignup;
  const hasConfig = configured();
  useEffect(() => {
    if (!hasConfig || isAuthPage) return;
    const controller = new AbortController();
    void fetch("/api/session", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async response => {
        if (response.status === 401) { window.location.replace("/login"); return; }
        const data = await response.json().catch(() => {
          throw new Error("로그인 확인 API를 찾을 수 없습니다. 사이트 배포를 확인하세요.");
        });
        if (!response.ok) throw new Error(data.error ?? "가족 DB에 연결하지 못했습니다.");
        if (data.configured !== true) throw new Error("로그인 확인 API의 응답이 올바르지 않습니다.");
        if (!controller.signal.aborted) setState({ ready: true });
      })
      .catch(error => {
        if (!controller.signal.aborted) setState({ ready: false, error: error instanceof Error ? error.message : "서버에 연결하지 못했습니다." });
      });
    return () => controller.abort();
  }, [hasConfig, isAuthPage]);
  if (!hasConfig) return <SetupNotice deployment="cloudflare" />;
  if (isLogin) return <LoginPage />;
  if (isSignup) return <SignupPage />;
  if (state.error) return <Failure message={state.error} />;
  if (!state.ready) return <main className="setup-page"><section className="setup-card"><h1>우리의 가계부</h1><p role="status">가족 계정을 확인하는 중입니다…</p></section></main>;
  return <LedgerApp initialMonth={koreaDate().slice(0, 7)} />;
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<ErrorBoundary><App /></ErrorBoundary>);
