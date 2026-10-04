import SignupForm from "@/components/SignupForm";
import SetupNotice from "@/components/SetupNotice";
import { configured } from "@/lib/supabase/config";
export default function SignupPage() {
  if (!configured()) return <SetupNotice />;
  return <main className="login-page"><section className="login-card signup-card">
    <div className="brand"><span className="brand-mark">₩</span><div><strong>우리의 가계부</strong><small>상화 · 하율</small></div></div>
    <h1>가족 계정 만들기</h1><SignupForm />
  </section></main>;
}
