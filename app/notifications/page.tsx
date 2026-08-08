import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { Card, EmptyState } from "@/components/ui";
import { fmtDate } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const actor = await requireStaff();
  const repo = await getRepo();
  const items = await repo.notificationsList(actor.id);

  // علّم الكل كمقروء بعد العرض
  const ticketIds = items.map((n) => n.ticket_id).filter(Boolean) as string[];
  const codes = new Map<string, string>();
  for (const id of ticketIds) {
    const t = await repo.ticketById(id);
    if (t) codes.set(id, t.code);
  }
  await repo.notificationsMarkRead(actor.id);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-extrabold">الإشعارات 🔔</h1>
      {items.length === 0 ? (
        <EmptyState>لا إشعارات حتى الآن — ستصلك هنا (وبإيقونة الجرس) عند إسناد تذاكر إليك أو تحديثها.</EmptyState>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card key={n.id} className={n.read_at ? "opacity-70" : ""}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm">{n.message}</p>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{fmtDate(n.created_at)}</span>
                  {n.ticket_id && codes.get(n.ticket_id) && (
                    <Link className="rounded-lg bg-blue-50 px-2 py-1 font-bold text-blue-700 hover:bg-blue-100" href={`/tickets/${codes.get(n.ticket_id)}`}>
                      فتح التذكرة
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
