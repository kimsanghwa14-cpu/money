import { GET as handle } from "@/lib/api/ledger";
import { nextRuntime } from "@/lib/next-runtime";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(request, nextRuntime());
}
