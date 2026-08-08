import { Card } from "@/components/ui";
import { TrackForm } from "@/components/public-forms";
import { getRepo } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const repo = await getRepo();
  const settings = await repo.settingsGet();

  if (!settings.allow_track) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-10 text-center">
        <div className="text-5xl">🚧</div>
        <h1 className="text-2xl font-extrabold">صفحة الاستعلام موقوفة مؤقتاً</h1>
        <p className="text-sm text-slate-500">موقوفة حالياً من إدارة النظام — تواصل مع فريق الدعم مباشرة.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">تتبع حالة الطلب</h1>
        <p className="mt-1 text-sm text-slate-500">استعلام آمن — يعرض حالة الطلب فقط دون أي بيانات حساسة</p>
      </div>
      <Card>
        <TrackForm initialCode={sp.code ?? ""} />
      </Card>
    </div>
  );
}
