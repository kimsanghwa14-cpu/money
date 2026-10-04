import { POST as handle } from "@/lib/api/settings";
import { nextRuntime } from "@/lib/next-runtime";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return handle(request, nextRuntime());
}
