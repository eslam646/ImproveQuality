import Link from "next/link";
import { getRepo } from "@/lib/db";
import { requireStaff, canManage, permissionsForStaff } from "@/lib/auth";
import { TicketsTable } from "@/components/tickets-table";
import { ALL_STATUSES, FINAL_STATUSES, REQUEST_TYPE_LABELS, STATUS_LABELS, TICKET_KIND_LABELS } from "@/lib/labels";
import { Button, inputCls, selectCls } from "@/components/ui";
import type { DevStatus, RequestType, TicketKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requireStaff();
  const sp = await searchParams;
  const repo = await getRepo();
  const manage = canManage(actor);
  const perms = await permissionsForStaff(actor);
  const canNewTicket = perms.create_standard_ticket ?? false;
  const canInstantSupport = perms.create_instant_support ?? false;
  const canExport = perms.export_csv ?? false;

  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const q = sp.q ?? "";
  const status = (sp.status ?? "") as DevStatus | "";
  const developer_id = sp.developer_id ?? "";
  const tester_id = sp.tester_id ?? "";
  const request_type = (sp.request_type ?? "") as RequestType | "";
  const ticket_kind = (sp.ticket_kind ?? "") as TicketKind | "";
  const canViewAll = perms.view_all_tickets ?? false;
  const mine = actor.role === "developer" && !canViewAll;

  const filterStaff = canViewAll ? await repo.staffList(true) : [];
  const devs = filterStaff.filter((s) => s.role === "developer");
  const testers = filterStaff.filter((s) => s.role === "tester");
  const [{ rows, total }, counts] = await Promise.all([
    repo.ticketList({
      q: q || undefined,
      status: status || undefined,
      developer_id: mine ? actor.id : developer_id || undefined,
      tester_id: actor.role === "tester" && !canViewAll ? actor.id : tester_id || undefined,
      request_type: request_type || undefined,
      ticket_kind: ticket_kind || undefined,
      created_by: actor.role === "support" && !canViewAll ? actor.id : undefined,
      page, pageSize: 15,
    }),
    repo.ticketCounts(),
  ]);

  // فريق التطوير (المتخصصون) لكل تذكرة في الصفحة الحالية — للعرض في عمود «المطور»
  const specialistsByTicket: Record<string, string> = {};
  await Promise.all(rows.filter((t) => !t.is_urgent).map(async (t) => {
    const specs = (await repo.specialistList(t.id)).filter((x) => x.status !== "declined");
    if (specs.length) specialistsByTicket[t.id] = specs.map((x) => `${x.staff_name} (${x.spec_label})`).join("، ");
  }));

  const openCount = Object.entries(counts.byStatus)
    .filter(([s]) => !FINAL_STATUSES.includes(s as DevStatus))
    .reduce((a, [, c]) => a + c, 0);
  const staleCutoff = Date.now() - 24 * 3600000;
  const stale = rows.filter((t) => new Date(t.last_status_change).getTime() < staleCutoff && !FINAL_STATUSES.includes(t.dev_status)).length;

  const totalPages = Math.max(1, Math.ceil(total / 15));
  const mkLink = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (status) u.set("status", status);
    if (developer_id) u.set("developer_id", developer_id);
    if (tester_id) u.set("tester_id", tester_id);
    if (request_type) u.set("request_type", request_type);
    if (ticket_kind) u.set("ticket_kind", ticket_kind);
    if (sp.mine) u.set("mine", sp.mine);
    u.set("page", String(p));
    return `/dashboard?${u.toString()}`;
  };

  return (
    <div className="space-y-5">
      {sp.denied && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⛔ صلاحية الوصول لهذه الصفحة غير مفعّلة لدورك — راجع مدير النظام لو تحتاجها.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">تذاكر الدعم الفني</h1>
          <p className="text-sm text-slate-500">
            {manage ? "صلاحية كاملة: إنشاء وتعيين وتحديث" : actor.role === "tester" ? "عرض فقط — نتائج الاختبار من واجهة الاختبار" : "واجهة قراءة فقط (تحديث الحالة يتم عبر نموذج التحديث العام بالكود)"}
          </p>
        </div>
        <div className="flex gap-2">
          {actor.role === "developer" && (
            <span className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">تذاكري المُسندة إليّ فقط</span>
          )}
          {canNewTicket && (
            <Link href="/tickets/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">+ طلب جديد</Link>
          )}
        </div>
      </div>

      {canInstantSupport && (
        <Link
          href="/instant-support"
          className="block rounded-2xl border border-rose-300 bg-gradient-to-l from-rose-600 to-orange-500 p-5 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xl font-extrabold">🚨 الدعم الفوري</div>
              <p className="mt-1 text-sm text-rose-50">مشكلة طارئة على السيرفر؟ حدّد العميل والتيست والمطور وأرسل التكليف لهم فورًا.</p>
            </div>
            <span className="shrink-0 rounded-xl bg-white/20 px-4 py-2 text-sm font-bold">فتح النموذج ←</span>
          </div>
        </Link>
      )}

      {/* إحصاءات */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "إجمالي التذاكر", val: counts.total, cls: "bg-white text-slate-800" },
          { label: "مفتوحة", val: openCount, cls: "bg-blue-600 text-white" },
          { label: "بانتظار الاختبار", val: counts.byStatus.ready_for_test ?? 0, cls: "bg-purple-600 text-white" },
          { label: "متوقفة > ٢٤ ساعة", val: stale, cls: "bg-amber-500 text-white" },
        ].map((c) => (
          <div key={c.label} className={`rounded-xl p-4 shadow-sm ${c.cls}`}>
            <div className="text-3xl font-extrabold">{c.val}</div>
            <div className="text-sm opacity-90">{c.label}</div>
          </div>
        ))}
      </div>

      {/* الفلاتر */}
      <form method="GET" className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <input name="q" defaultValue={q} placeholder="بحث بالكود أو اسم العميل…" className={`${inputCls} max-w-xs`} />
        <select name="status" defaultValue={status} className={`${selectCls} max-w-48`}>
          <option value="">كل الحالات</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select name="request_type" defaultValue={request_type} className={`${selectCls} max-w-48`}>
          <option value="">كل أنواع الطلب</option>
          {Object.entries(REQUEST_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select name="ticket_kind" defaultValue={ticket_kind} className={`${selectCls} max-w-44`}>
          <option value="">عادي + دعم فوري</option>
          {Object.entries(TICKET_KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {canViewAll && (
          <>
            <select name="tester_id" defaultValue={tester_id} className={`${selectCls} max-w-48`}>
              <option value="">كل مسؤولي الاختبار</option>
              {testers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select name="developer_id" defaultValue={developer_id} className={`${selectCls} max-w-48`}>
              <option value="">كل المطورين</option>
              {devs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </>
        )}
        <Button type="submit">تصفية</Button>
        <Link href="/dashboard" className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">مسح</Link>
        {canExport && (
          <a href="/api/export.csv" className="mr-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            تصدير Excel/CSV ⬇
          </a>
        )}
      </form>

      <TicketsTable
        rows={rows}
        specialistsByTicket={specialistsByTicket}
        storageKey={`support-hub-columns-${actor.id}`}
        readOnlyNote={manage ? undefined : actor.role === "support"
          ? "🔒 مدخل البيانات: تذاكرك فقط — قراءة وإضافة ملاحظات، بدون تعديل البيانات أو الحالة أو المرفقات."
          : actor.role === "developer" ? "🔒 تظهر تذاكرك المسندة فقط — تغييرات الحالة وفق دورة المطور." : undefined}
      />

      {/* ترقيم الصفحات */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && <Link className="rounded-lg bg-white px-3 py-1.5 shadow-sm" href={mkLink(page - 1)}>→ السابق</Link>}
          <span className="text-slate-500">صفحة {page} من {totalPages} ({total} تذكرة)</span>
          {page < totalPages && <Link className="rounded-lg bg-white px-3 py-1.5 shadow-sm" href={mkLink(page + 1)}>التالي ←</Link>}
        </div>
      )}
    </div>
  );
}
