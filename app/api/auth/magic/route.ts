import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { AUTH_COOKIE } from "@/lib/auth";
import { hashPrivateToken } from "@/lib/private-links";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// دخول برابط شخصي (Magic Link) — بدون PIN:
// - الرابط سري وموقّع بهوية موظف واحد، ويمكن إلغاؤه فوراً من صفحة الموظفين
// - «مدير النظام» مستثنى عمداً: حسابه لا يدخل إلا بالرقم السري (حماية النظام كله)
// - كل دخول يُسجل في سجل التدقيق بعنوان IP والمتصفح
export async function GET(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`magic:${ip}`, 15, 60_000)) {
    return NextResponse.redirect(new URL("/login?err=" + encodeURIComponent("محاولات كثيرة — انتظر دقيقة"), req.url));
  }
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  const fail = (msg: string) => NextResponse.redirect(new URL(`/login?err=${encodeURIComponent(msg)}`, req.url));
  if (token.length < 32) return fail("رابط الدخول غير صالح");

  const repo = await getRepo();
  const link = await repo.privateLinkByHash(hashPrivateToken(token));
  if (!link || (link.kind ?? "request") !== "login") return fail("رابط الدخول غير صالح أو أُلغي — اطلب رابطاً جديداً من المدير");

  const staff = await repo.staffGet(link.staff_id);
  if (!staff || !staff.active) return fail("الحساب غير متاح");
  if (staff.role === "admin") return fail("حساب مدير النظام لا يدخل بالرابط — استخدم الرقم السري");

  await repo.privateLinkTouch(link.id);
  await repo.auditAdd({
    entity_type: "staff", entity_id: staff.id, action: "auth.magic_login",
    actor_staff_id: staff.id, actor_label: staff.name,
    new_values: { link_id: link.id },
    request_ip: ip, user_agent: req.headers.get("user-agent"),
  });

  const res = NextResponse.redirect(new URL("/dashboard", req.url));
  // الجلسة مربوطة بالرابط نفسه: إلغاء الرابط من صفحة الموظفين = طرد فوري من كل جلسة فُتحت به
  res.cookies.set(AUTH_COOKIE, `${staff.id}:${link.id}`, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return res;
}
