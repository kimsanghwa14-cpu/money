import type {Metadata} from "next";
import "./globals.css";
export const metadata:Metadata={title:"리온이네 가계부 | 상화 · 하율",description:"부부가 함께 기록하는 가족 가계부",robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>;}
