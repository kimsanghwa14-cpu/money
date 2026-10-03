import {redirect} from "next/navigation";
import {configured} from "@/lib/supabase/config";
import {context,ApiError} from "@/lib/server";
import {koreaDate} from "@/lib/domain";
import LedgerApp from "@/components/LedgerApp";
import SetupNotice from "@/components/SetupNotice";
export const dynamic="force-dynamic";
export default async function Page(){
  if(!configured())return <SetupNotice/>;
  try{await context();}catch(e){if(e instanceof ApiError&&e.status===401)redirect("/login");return <main className="setup-page"><section className="setup-card"><h1>가계부에 접근할 수 없습니다.</h1><p>{e instanceof Error?e.message:"가족 인증과 DB 연결을 확인하세요."}</p><a href="/login">다른 가족 계정으로 로그인</a></section></main>;}
  return <LedgerApp initialMonth={koreaDate().slice(0,7)}/>;
}
