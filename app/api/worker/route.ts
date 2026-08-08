import { NextResponse } from "next/server";
import { processAll } from "@/lib/worker";

// يستدعيه pg_cron (pg_net) في الإنتاج كل دقيقة — أو أي جدولة خارجية
export async function POST(req: Request) {
  const secret = req.headers.get("x-worker-secret");
  const expected = process.env.WORKER_SECRET || "dev-secret";
  if (secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const report = await processAll();
  return NextResponse.json({ ok: true, ...report });
}
