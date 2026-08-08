import { requirePerm, requireStaff } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { Badge, Card, EmptyState } from "@/components/ui";
import { ResendButton } from "@/components/resend-button";
import { fmtDate } from "@/lib/util";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, { l: string; c: string }> = {
  sent: { l: "أُرسل ✅", c: "bg-green-100 text-green-700" },
  delivered: { l: "سُلّم 📬", c: "bg-green-200 text-green-800" },
  logged: { l: "مسجل (وضع تجريبي) 📝", c: "bg-blue-100 text-blue-700" },
  failed: { l: "فشل ❌", c: "bg-rose-100 text-rose-700" },
  bounced: { l: "ارتدد ⚠️", c: "bg-amber-100 text-amber-800" },
};

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePerm("emails");
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const repo = await getRepo();
  const { rows, total } = await repo.emailLogList(page, 20);
  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">سجل البريد الصادر</h1>
        <p className="text-sm text-slate-500">
          كل رسالة أرسلها النظام مسجلة هنا بالكامل — بدون مفاتيح API تعمل في «وضع التسجيل» (المعاينة الكاملة دون إرسال فعلي)
        </p>
      </div>
      {rows.length === 0 ? (
        <EmptyState>لا يوجد بريد بعد — جرّب إنشاء طلب أو تغيير حالة لمشاهدة الأتمتة تعمل.</EmptyState>
      ) : (
        <div className="space-y-3">
          {rows.map((m) => (
            <Card key={m.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{m.subject}</p>
                  <p className="text-xs text-slate-500">
                    إلى: <b>{m.to_addr}</b>{m.cc_addr ? <> — نسخة: <b>{m.cc_addr}</b></> : null} — عبر {m.provider}
                  </p>
                  <p className="text-xs text-slate-400">{fmtDate(m.created_at)}{m.error ? ` — خطأ: ${m.error.slice(0, 120)}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={STATUS_BADGE[m.status]?.c ?? "bg-slate-100"}>{STATUS_BADGE[m.status]?.l ?? m.status}</Badge>
                  <ResendButton id={m.id} />
                </div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-bold text-blue-700">عرض محتوى الرسالة</summary>
                <iframe title={m.id} className="mt-2 h-80 w-full rounded-lg border" sandbox="" srcDoc={m.body_html} />
              </details>
            </Card>
          ))}
        </div>
      )}
      {pages > 1 && (
        <div className="flex justify-center gap-2 text-sm">
          {page > 1 && <a className="rounded-lg bg-white px-3 py-1.5 shadow-sm" href={`/emails?page=${page - 1}`}>→ السابق</a>}
          <span className="py-1.5 text-slate-500">صفحة {page} من {pages}</span>
          {page < pages && <a className="rounded-lg bg-white px-3 py-1.5 shadow-sm" href={`/emails?page=${page + 1}`}>التالي ←</a>}
        </div>
      )}
    </div>
  );
}
