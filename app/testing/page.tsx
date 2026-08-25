import { getRepo } from "@/lib/db";
import { requirePerm, requireStaff } from "@/lib/auth";
import { TesterResultForm } from "@/components/tester-result-form";
import { Badge, Card, EmptyState, Msg } from "@/components/ui";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/labels";
import { fmtDate } from "@/lib/util";
import Link from "next/link";
import type { Ticket } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TestingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePerm("testing");
  const actor = await requireStaff();
  const sp = await searchParams;
  const repo = await getRepo();
  const [{ rows: ready }, { rows: testing }] = await Promise.all([
    repo.ticketList({ status: "ready_for_test", pageSize: 50 }),
    repo.ticketList({ status: "testing", pageSize: 50 }),
  ]);
  const rows = [...testing, ...ready];

  // فريق التطوير (المتخصصون) لكل تذكرة — بدل «المطور: —» الفارغ بعد التوحيد على التخصصات
  const teamByTicket: Record<string, string> = {};
  await Promise.all(rows.filter((t) => !t.is_urgent).map(async (t) => {
    const specs = (await repo.specialistList(t.id)).filter((x) => x.status !== "declined");
    if (specs.length) teamByTicket[t.id] = specs.map((x) => `${x.staff_name} (${x.spec_label})`).join("، ");
  }));

  // 📜 اختباراتي السابقة: آخر ما اختبرته أنا (نجح/فشل/أُغلق) — مرجع سريع للتيستر
  const historyStatuses = ["test_passed", "test_failed", "fixed", "closed"] as const;
  const historyChunks = await Promise.all(
    historyStatuses.map((s) => repo.ticketList({ status: s, tester_id: actor.id, pageSize: 10, sort: "updated" })),
  );
  const history: Ticket[] = historyChunks
    .flatMap((c) => c.rows)
    .sort((a, b) => Date.parse(b.updated_at ?? b.created_at) - Date.parse(a.updated_at ?? a.created_at))
    .slice(0, 15);

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
              <p className="mt-1 text-xs text-slate-400">فريق التطوير: {teamByTicket[t.id] ?? t.developer_name ?? "—"}</p>
              <TesterResultForm code={t.code} status={t.dev_status} />
            </Card>
          ))}
        </div>
      )}

      {/* 📜 سجل اختباراتي — آخر التذاكر التي اختبرتُها ونتيجتها */}
      {history.length > 0 && (
        <Card title="📜 اختباراتي السابقة (آخر 15)">
          <ul className="divide-y divide-slate-100">
            {history.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link href={`/tickets/${t.code}`} className="font-mono text-sm font-bold text-blue-700 hover:underline" dir="ltr">{t.code}</Link>
                <span className="text-sm text-slate-600">{t.title || t.client_name}</span>
                <span className="mr-auto flex items-center gap-2">
                  <Badge color={STATUS_COLORS[t.dev_status]}>{STATUS_LABELS[t.dev_status]}</Badge>
                  <span className="text-xs text-slate-400">{fmtDate(t.updated_at ?? t.last_status_change)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
