import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getRepo } from "@/lib/db";
import { currentStaff, permissionsForStaff } from "@/lib/auth";
import { genId } from "@/lib/util";

const MAX_MB = Math.max(4, Math.min(100, Number(process.env.MAX_ATTACHMENT_MB || 25)));
const MAX_BYTES = MAX_MB * 1024 * 1024; // مؤقتاً عبر التطبيق؛ V2 سينقل الفيديو الكبير إلى R2 Direct Upload

// رفع مرفق: يقبل أعضاء الفريق (كوكي) أو أي شخص يملك كود الطلب (عام، مثل فلسفة النماذج)
export async function POST(req: Request) {
  const form = await req.formData();
  const code = String(form.get("code") ?? "").trim();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "الملف مطلوب" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `الحد الأقصى الحالي ${MAX_MB} ميجابايت` }, { status: 400 });

  const repo = await getRepo();
  const ticket = await repo.ticketByCode(code);
  if (!ticket) return NextResponse.json({ error: "كود الطلب غير موجود" }, { status: 404 });

  const actor = await currentStaff();
  const initialGuestWindow = ticket.source === "web_guest" && Date.now() - new Date(ticket.created_at).getTime() <= 15 * 60_000;
  const perms = actor ? await permissionsForStaff(actor) : null;
  const related = actor ? perms?.view_all_tickets || ticket.created_by === actor.id || ticket.tester_id === actor.id || ticket.developer_id === actor.id : false;
  const allowed = actor ? !!perms?.upload_attachment && !!related : initialGuestWindow;
  if (!allowed) {
    return NextResponse.json({ error: "رفع المرفقات غير مسموح: للأدمن أو المسؤول المسند فقط، أو أثناء إنشاء الطلب العام" }, { status: 403 });
  }
  const uploader = actor?.name ?? "مقدم الطلب (أثناء الإنشاء)";

  const safeName = file.name.replace(/[^\w.\u0600-\u06FF-]+/g, "_").slice(-80);
  const fname = `${Date.now()}_${safeName}`;

  let storedPath: string;
  let driver: "local" | "supabase";

  if (process.env.DB_DRIVER === "supabase") {
    // الإنتاج: رفع إلى Supabase Storage (bucket عام attachments) عبر REST — يعمل على Edge
    const sbUrl = process.env.SUPABASE_URL!;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const relPath = `${ticket.code}/${fname}`;
    const up = await fetch(`${sbUrl}/storage/v1/object/attachments/${relPath}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${sbKey}`,
        "x-upsert": "true",
        "content-type": file.type || "application/octet-stream",
      },
      body: await file.arrayBuffer(),
    });
    if (!up.ok) {
      const t = await up.text();
      return NextResponse.json({ error: `فشل رفع المرفق للتخزين: ${t.slice(0, 160)}` }, { status: 502 });
    }
    storedPath = `${sbUrl}/storage/v1/object/public/attachments/${relPath}`;
    driver = "supabase";
  } else {
    // محلي: القرص
    const absDir = path.join(process.cwd(), "data", "uploads", ticket.code);
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(path.join(absDir, fname), Buffer.from(await file.arrayBuffer()));
    storedPath = path.join(ticket.code, fname);
    driver = "local";
  }

  const att = await repo.attachmentAdd({
    id: genId("att"), ticket_id: ticket.id, file_name: file.name, size_bytes: file.size,
    path: storedPath, driver, uploaded_by: uploader,
  });
  await repo.eventAdd({
    ticket_id: ticket.id, type: "attachment.added", actor_label: uploader,
    old_values: null, new_values: { file: file.name },
  });
  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticket.id, action: "attachment.uploaded",
    actor_staff_id: actor?.id ?? null, actor_label: uploader,
    old_values: null, new_values: { attachment_id: att.id, file_name: file.name, size_bytes: file.size, mime_type: file.type },
    user_agent: req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true, id: att.id });
}
