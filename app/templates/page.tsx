import Link from "next/link";
import { requirePerm, requireStaff } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await requirePerm("templates");
  const repo = await getRepo();
  const templates = await repo.templateList();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">قوالب البريد</h1>
          <p className="text-sm text-slate-500">تحكم كامل في شكل الإيميلات — عربية RTL مع متغيرات ديناميكية</p>
        </div>
        <Link href="/templates/editor" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">+ قالب جديد</Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((t) => (
          <Card key={t.id} title={t.name} actions={
            <Link href={`/templates/editor?id=${t.id}`} className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold hover:bg-slate-300">تحرير</Link>
          }>
            <p className="text-sm text-slate-500">الموضوع: <b className="text-slate-700">{t.subject}</b></p>
          </Card>
        ))}
      </div>
    </div>
  );
}
