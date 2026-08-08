import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { AUTH_COOKIE, pinHash } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/ratelimit";

// دخول الإنتاج (AUTH_MODE=pin): موظف + رقم سري — كوكي جلسة آمن 30 يوم
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`pin:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "محاولات كثيرة — انتظر دقيقة وحاول مجدداً" }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { staff_id?: string; pin?: string } | null;
  const staffId = (body?.staff_id ?? "").trim();
  const pin = (body?.pin ?? "").trim();
  if (!staffId || pin.length < 4) {
    return NextResponse.json({ error: "اختر الاسم وأدخل الرقم السري (4 أرقام فأكثر)" }, { status: 400 });
  }

  const repo = await getRepo();
  const staff = await repo.staffGet(staffId);
  if (!staff || !staff.active) {
    return NextResponse.json({ error: "الحساب غير موجود أو موقوف" }, { status: 403 });
  }
  if (!staff.pin_hash) {
    return NextResponse.json({ error: "لم يُضبط رقم سري لهذا الحساب بعد — اطلب من المدير ضبطه من شاشة الموظفين" }, { status: 403 });
  }
  if (staff.pin_hash !== pinHash(pin)) {
    return NextResponse.json({ error: "الرقم السري غير صحيح" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, name: staff.name });
  res.cookies.set(AUTH_COOKIE, staff.id, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return res;
}
