import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { changeStatusOp } from "@/lib/ops";
import { publicUpdateSchema } from "@/lib/validators";
import { allowedTransitions, NOTE_REQUIRED_STATUSES, ROLE_LABELS, STATUS_LABELS } from "@/lib/labels";
import { currentStaff } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/ratelimit";

// نموذج التحديث العام: معبأ مسبقاً بالكود، والقفل مفروض هنا في الخادم
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`update:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "محاولات كثيرة" }, { status: 429 });
  }
  const parsed = publicUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" }, { status: 400 });
  }
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  if (!settings.allow_public_update) {
    return NextResponse.json({ error: "نموذج التحديث العام موقوف حالياً من إدارة النظام" }, { status: 403 });
  }
  const t = await repo.ticketByCode(parsed.data.code);
  if (!t) return NextResponse.json({ error: "كود الطلب غير موجود" }, { status: 404 });
  const actor = await currentStaff();
  if (!actor || actor.role === "support") {
    return NextResponse.json({ error: "مدخل البيانات في وضع القراءة فقط ولا يملك تغيير الحالة" }, { status: 403 });
  }
  const assigned = actor.role === "admin"
    || (actor.role === "tester" && t.tester_id === actor.id)
    || (actor.role === "developer" && t.developer_id === actor.id);
  if (!assigned) return NextResponse.json({ error: "الطلب غير مسند إليك" }, { status: 403 });
  if (actor.role === "tester" && t.tester_assignment_status !== "accepted")
    return NextResponse.json({ error: "يجب قبول تكليف الاختبار أولاً" }, { status: 403 });
  if (actor.role === "developer" && t.developer_assignment_status !== "accepted")
    return NextResponse.json({ error: "يجب قبول تكليف التطوير أولاً" }, { status: 403 });
  const allowed = allowedTransitions(actor.role, t.dev_status);
  if (!allowed.includes(parsed.data.dev_status as never)) {
    return NextResponse.json({ error: "تحويل الحالة غير مسموح لدورك أو للحالة الحالية" }, { status: 403 });
  }
  if (NOTE_REQUIRED_STATUSES.includes(parsed.data.dev_status as never) && !parsed.data.note?.trim()) {
    return NextResponse.json({ error: "سبب الرفض / سبب فشل الاختبار إجباري — اكتبه ليُرسل في الإيميل" }, { status: 400 });
  }

  const updated = await changeStatusOp(t.id, parsed.data.dev_status as never, `${actor.name} (${ROLE_LABELS[actor.role]})`, parsed.data.note || undefined);
  return NextResponse.json({ ok: true, status_label: STATUS_LABELS[(updated ?? t).dev_status] });
}
