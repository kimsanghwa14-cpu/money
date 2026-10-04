import { GET as read, POST as write } from "@/lib/api/assets";
import { nextRuntime } from "@/lib/next-runtime";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return read(request, nextRuntime()); }
export async function POST(request: Request) { return write(request, nextRuntime()); }
