import { webBuildIdentity } from "@/lib/build-identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return Response.json(webBuildIdentity(), {
    headers: { "cache-control": "no-store" }
  });
}
