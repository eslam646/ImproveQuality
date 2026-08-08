import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getRepo } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepo();
  const att = await repo.attachmentGet(id);
  if (!att) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  if (att.driver === "supabase") {
    return NextResponse.redirect(att.path); // رابط التخزين العام في الإنتاج
  }
  const abs = path.join(process.cwd(), "data", "uploads", att.path);
  try {
    const buf = await fs.readFile(abs);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(att.file_name)}`,
      },
    });
  } catch {
    return NextResponse.json({ error: "الملف غير موجود على القرص" }, { status: 404 });
  }
}
