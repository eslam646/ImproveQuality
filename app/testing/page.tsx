import { getRepo } from "@/lib/db";
import { requirePerm, requireStaff } from "@/lib/auth";
import { TesterResultForm } from "@/components/tester-result-form";
import { Badge, Card, EmptyState, Msg } from "@/components/ui";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/labels";
import { fmtDate } from "@/lib/util";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TestingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePerm("testing");
  const sp = await searchParams;
  const repo = await getRepo();
  const [{ rows: ready }, { rows: testing }] = await Promise.all([
    repo.ticketList({ status: "ready_for_test", pageSize: 50 }),
    repo.ticketList({ status: "testing", pageSize: 50 }),
  ]);
  const rows = [...testing, ...ready];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">واجهة الاختبار (QA)</h1>
        <p className="text-sm text-slate-500">التذاكر في حالة «جاهز للاختبار» — اعتماد أو رفض يُطلق إشعارات تلقائية للمطور والمدير.</p>
      </div>
      {sp.ok && <Msg type="ok">{sp.ok}</Msg>}
      {sp.err && <Msg type="err">{sp.err}</Msg>}

      {rows.length === 0 ? (
        <EmptyState>لا توجد تذاكر بانتظار الاختبار حالياً ✓</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((t) => (
            <Card key={t.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/tickets/${t.code}`} className="font-extrabold text-blue-700 hover:underline" dir="ltr">{t.code}</Link>
                  <span className="mr-2"><Badge color={STATUS_COLORS[t.dev_status]}>{STATUS_LABELS[t.dev_status]}</Badge></span>
                </div>
                <span className="text-xs text-slate-400">منذ {fmtDate(t.last_status_change)}</span>
              </div>
              <p className="mt-2 font-semibold">{t.client_name}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{t.details}</p>
              <p className="mt-1 text-xs text-slate-400">المطور: {t.developer_name ?? "—"}</p>
              <TesterResultForm code={t.code} status={t.dev_status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
