import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getRepo } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { uploadSupabaseAttachment } from "@/lib/storage";

const MAX_MB = Math.max(4, Math.min(100, Number(process.env.MAX_ATTACHMENT_MB || 50)));
const MAX_BYTES = MAX_MB * 1024 * 1024;
const ALLOWED_EXT = ["png", "jpg", "jpeg", "webp", "gif", "pdf", "txt", "log", "zip", "doc", "docx", "xls", "xlsx", "mp4", "mov", "webm", "mkv"];

// رفع ملف لحقل مخصص من نوع «ملف» — لا يعمل إلا إذا فعّل الأدمن حقل ملف واحداً على الأقل،
// وأسماء الملفات عشوائية تماماً (لا يتحكم المستخدم في المسار إطلاقاً)
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`cfup:${ip}`, 15, 60_000)) {
    return NextResponse.json({ error: "محاولات كثيرة — انتظر قليلاً وحاول مجدداً" }, { status: 429 });
  }

  const repo = await getRepo();
  const settings = await repo.settingsGet();
  if (!settings.custom_fields.some((f) => f.type === "file")) {
    return NextResponse.json({ error: "رفع الملفات غير مفعّل — فعّل حقل ملف من الإعدادات أولاً" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "الملف مطلوب" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `الحد الأقصى الحالي ${MAX_MB} ميجابايت` }, { status: 400 });

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    return NextResponse.json({ error: "نوع الملف غير مسموح — المسموح: صور، فيديو MP4/MOV/WEBM/MKV، PDF، Office، ZIP، TXT وLOG" }, { status: 400 });
  }

  const fname = `${crypto.randomUUID()}.${ext}`;

  if (process.env.DB_DRIVER === "supabase") {
    // الإنتاج: Supabase Storage (bucket عام attachments) عبر REST — يعمل على Edge
    const sbUrl = process.env.SUPABASE_URL!;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const relPath = `cf/${fname}`;
    try {
      const uploaded = await uploadSupabaseAttachment({
        url: sbUrl, key: sbKey, relPath,
        data: await file.arrayBuffer(), contentType: file.type || "application/octet-stream",
      });
      return NextResponse.json({ ok: true, url: uploaded.publicUrl, name: file.name });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `تعذر تجهيز/رفع الملف: ${message}` }, { status: 502 });
    }
  }

  // محلي: القرص (بيئة التطوير فقط — الرابط رمزي للعرض)
  const dir = path.join(process.cwd(), "data", "uploads", "cf");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fname), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ ok: true, url: `local://cf/${fname}`, name: file.name });
}
