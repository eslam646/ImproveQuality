import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";

// ويب هوك Brevo: يحدّث حالة البريد في السجل (تم التسليم / ارتداد)
// فعّله من حساب Brevo → Webhooks → https://YOUR-APP/api/webhooks/brevo
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { event?: string; "message-id"?: string; reason?: string };
  const msgId = body["message-id"];
  if (!msgId) return NextResponse.json({ ok: true });

  const repo = await getRepo();
  if (body.event === "delivered") await repo.emailLogSetStatusByMsg(msgId, "delivered");
  else if (["bounce", "hard_bounce", "soft_bounce", "blocked", "error"].includes(body.event ?? ""))
    await repo.emailLogSetStatusByMsg(msgId, "bounced", body.reason ?? null);
  return NextResponse.json({ ok: true });
}
