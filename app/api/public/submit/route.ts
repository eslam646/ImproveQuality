import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { createTicketOp } from "@/lib/ops";
import { guestSubmitSchema } from "@/lib/validators";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`submit:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "محاولات كثيرة — انتظر دقيقة وحاول مجدداً" }, { status: 429 });
  }
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  if (!settings.allow_guest_submit) {
    return NextResponse.json({ error: "استقبال الطلبات العامة موقوف حالياً" }, { status: 403 });
  }
  const body = (await req.json()) as {
    client_id?: string; client_name?: string; client_contact?: string; details?: string;
    custom?: Record<string, string>;
  };
  const cfg = settings.form_fields;
  const need = (k: string) => cfg.find((f) => f.key === k)?.required ?? false;

  const client_id = body.client_id || null;
  const client_name = (body.client_name ?? "").trim();
  const client_contact = (body.client_contact ?? "").trim();
  const details = (body.details ?? "").trim();

  if (need("client") && !client_id && client_name.length < 2)
    return NextResponse.json({ error: "اختر اسمك/شركتك من القائمة أو اكتبه" }, { status: 400 });
  if (need("client_contact") && !client_contact)
    return NextResponse.json({ error: "وسيلة التواصل إجبارية" }, { status: 400 });
  if (need("details") && details.length < 5)
    return NextResponse.json({ error: "اكتب تفاصيل كافية للطلب" }, { status: 400 });

  // الحقول المخصصة الظاهرة للضيوف: تحقق من الإجبارية + قصّ القيم بأمان
  const custom: Record<string, string> = {};
  for (const cf of settings.custom_fields.filter((f) => f.guest)) {
    const v = (body.custom?.[cf.key] ?? "").trim().slice(0, 500);
    if (cf.required && !v) {
      return NextResponse.json({ error: `حقل «${cf.label}» إجباري` }, { status: 400 });
    }
    if (v && cf.type === "file" && !/^[^|]{1,100}\|(https?:\/\/|local:\/\/)/.test(v)) {
      return NextResponse.json({ error: `حقل «${cf.label}»: تعذر قبول الملف — أعد رفعه` }, { status: 400 });
    }
    if (v) custom[cf.key] = v;
  }

  const displayName = client_id ? (await repo.clientsList()).find((c) => c.id === client_id)?.name ?? client_name : client_name;
  const finalName = (client_id ? displayName : client_name) || client_name;
  // بريد العميل المسجل يُستخدم تلقائياً إن لم يكتب وسيلة تواصل
  const clientRow = client_id ? (await repo.clientsList()).find((c) => c.id === client_id) : null;
  const finalContact = client_contact || clientRow?.contact_email || null;
  const ticket = await createTicketOp({
    client_name: finalName, client_contact: finalContact, details,
    developer_id: null,
    actor: { staff_id: null, label: `${finalName || "زائر"} (نموذج عام)` },
    source: "web_guest",
    custom_data: custom,
  });
  return NextResponse.json({ ok: true, code: ticket.code });
}
