import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import fs from "fs/promises";
import path from "path";
import { getRepo } from "@/lib/db";
import { AUTH_COOKIE } from "@/lib/auth";
import { genId } from "@/lib/util";

const MAX_BYTES = 4 * 1024 * 1024; // 4MB

// رفع مرفق: يقبل أعضاء الفريق (كوكي) أو أي شخص يملك كود الطلب (عام، مثل فلسفة النماذج)
export async function POST(req: Request) {
  const form = await req.formData();
  const code = String(form.get("code") ?? "").trim();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "الملف مطلوب" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "الحد الأقصى 4 ميجابايت" }, { status: 400 });

  const repo = await getRepo();
  const ticket = await repo.ticketByCode(code);
  if (!ticket) return NextResponse.json({ error: "كود الطلب غير موجود" }, { status: 404 });

  let uploader = "زائر (عبر كود الطلب)";
  const store = await cookies();
  const sid = store.get(AUTH_COOKIE)?.value;
  if (sid) {
    const s = await repo.staffGet(sid);
    if (s) uploader = s.name;
  }

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
  return NextResponse.json({ ok: true, id: att.id });
}
