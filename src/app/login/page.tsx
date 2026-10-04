import LoginForm from "@/components/LoginForm";
import SetupNotice from "@/components/SetupNotice";
import {configured} from "@/lib/supabase/config";
export default function LoginPage(){if(!configured())return <SetupNotice/>;return <main className="login-page"><section className="login-card"><div className="brand"><span className="brand-mark">₩</span><div><strong>리온이네 가계부</strong><small>상화 · 하율</small></div></div><h1>가족 계정으로 로그인</h1><LoginForm/></section></main>;}
