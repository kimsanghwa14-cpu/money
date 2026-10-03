"use client";
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){return <main className="setup-page"><section className="setup-card"><h1>화면을 불러오지 못했습니다.</h1><p>일시적인 연결 문제인지 확인한 뒤 다시 시도하세요. 저장되지 않은 입력은 CSV·JSON 백업을 통해 보관하세요.</p><button className="primary" onClick={reset}>다시 시도</button></section></main>;}
