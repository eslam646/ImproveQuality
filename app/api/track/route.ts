import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { ASSIGNMENT_STATUS_LABELS, REQUEST_TYPE_LABELS, STATUS_LABELS, TICKET_KIND_LABELS, urgentStatusInfo } from "@/lib/labels";
import type { DevStatus } from "@/lib/types";
import { clientIp, rateLimit } from "@/lib/ratelimit";

// استعلام آمن بالتصميم: الأدمن يتحكم من الإعدادات في كل ما يظهر هنا،
// وبيانات التواصل لا تُعاد إطلاقاً أيًا كانت الإعدادات.
export async function GET(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`track:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "محاولات كثيرة" }, { status: 429 });
  }
  const code = new URL(req.url).searchParams.get("code")?.trim() ?? "";
  if (code.length < 6) return NextResponse.json({ error: "كود غير صالح" }, { status: 400 });

  const repo = await getRepo();
  const settings = await repo.settingsGet();
  if (!settings.allow_track) {
    return NextResponse.json({ error: "صفحة الاستعلام موقوفة حالياً من إدارة النظام" }, { status: 403 });
  }
  const cfg = settings.track_cfg;

  const t = await repo.ticketByCode(code);
  if (!t) return NextResponse.json({ error: "كود الطلب غير موجود" }, { status: 404 });

  const body: Record<string, unknown> = {
    code: t.code,
    // الدعم الفوري «طلب جانبي»: حالته من دورة حياته وليست حالة التطوير
    status_label: t.is_urgent ? urgentStatusInfo(t).label : STATUS_LABELS[t.dev_status],
    display_order: cfg.order ?? [],
  };
  if (cfg.show_last_change) body.last_status_change = t.last_status_change;
  if (cfg.show_client) body.client_name = t.client_name;
  if (cfg.show_title) body.title = t.title ?? "—";
  if (cfg.show_request_type) body.request_type_label = REQUEST_TYPE_LABELS[t.request_type ?? "issue"];
  if (cfg.show_ticket_kind) body.ticket_kind_label = TICKET_KIND_LABELS[t.ticket_kind ?? (t.is_urgent ? "instant_support" : "standard")];
  if (cfg.show_priority) body.priority_label = ({ low: "منخفضة", normal: "عادية", high: "مرتفعة", critical: "حرجة" } as const)[t.priority ?? "normal"];
  if (cfg.show_creator) body.creator_name = t.created_by_name;
  if (cfg.show_tester) body.tester_name = t.tester_name;
  if (cfg.show_developer) body.developer_name = t.developer_name;
  if (cfg.show_assignment_status) {
    body.tester_assignment_status_label = ASSIGNMENT_STATUS_LABELS[t.tester_assignment_status ?? "unassigned"];
    body.developer_assignment_status_label = ASSIGNMENT_STATUS_LABELS[t.developer_assignment_status ?? "unassigned"];
  }
  if (cfg.show_affected_service) body.affected_service = t.affected_service;
  if (cfg.show_estimation && (t.est_days || t.est_hours)) {
    body.estimation = { days: t.est_days ?? null, hours: t.est_hours ?? null };
  }
  if (cfg.show_custom && t.custom_data) {
    body.custom = settings.custom_fields
      .filter((f) => t.custom_data?.[f.key])
      .map((f) => ({ label: f.label, value: t.custom_data![f.key], file: f.type === "file" }));
  }
  if (cfg.show_timeline) {
    if (t.is_urgent) {
      // الدعم الفوري «طلب جانبي»: المسار من دورة حياته — من سجل التدقيق (بالأسماء، بدون أسباب داخلية)
      const audit = await repo.auditList("ticket", t.id);
      const nameOf = (label: string | null) => (label ?? "").split(" (")[0] || "—";
      const steps: { status_label: string; at: string }[] = [{ status_label: "🚨 تم تسجيل طلب الدعم الفوري", at: t.created_at }];
      for (const a of [...audit].reverse()) {
        const who = nameOf(a.actor_label);
        if (a.action === "tester.assigned") steps.push({ status_label: `🧪 أُسند الاختبار إلى ${String((a.new_values as { tester_name?: string })?.tester_name ?? "—")}`, at: a.created_at });
        else if (a.action === "developer.assigned") steps.push({ status_label: `👨‍💻 أُسند التطوير إلى ${String((a.new_values as { developer_name?: string })?.developer_name ?? "—")}`, at: a.created_at });
        else if (a.action === "tester.accepted") steps.push({ status_label: `✅ وافق التيستر ${who} على التكليف`, at: a.created_at });
        else if (a.action === "tester.declined") steps.push({ status_label: `❌ رفض التيستر ${who} التكليف — بانتظار إعادة الإسناد`, at: a.created_at });
        else if (a.action === "developer.accepted") steps.push({ status_label: `✅ وافق المطور ${who} على التكليف`, at: a.created_at });
        else if (a.action === "developer.declined") steps.push({ status_label: `❌ رفض المطور ${who} التكليف — بانتظار إعادة الإسناد`, at: a.created_at });
        else if (a.action === "tester.urgent_withdrawal") steps.push({ status_label: `🙅 اعتذر التيستر ${who} عن الاستمرار — بانتظار إعادة الإسناد`, at: a.created_at });
        else if (a.action === "developer.urgent_withdrawal") steps.push({ status_label: `🙅 اعتذر المطور ${who} عن الاستمرار — بانتظار إعادة الإسناد`, at: a.created_at });
        else if (a.action === "urgent.still_working") steps.push({ status_label: `🔄 ${who} مازال يعمل على النقطة`, at: a.created_at });
        else if (a.action === "urgent.completed") steps.push({ status_label: `✅ ${who} أنهى الدعم الفوري — انتهت هذه النقطة`, at: a.created_at });
      }
      body.timeline = steps;
    } else {
      const events = await repo.eventList(t.id);
      body.timeline = [
        { status_label: "تم إنشاء الطلب", at: t.created_at },
        ...events
          .filter((e) => e.type === "field.changed")
          .reverse()
          .map((e) => ({
            status_label: STATUS_LABELS[(e.new_values as { dev_status: DevStatus }).dev_status] ?? "",
            at: e.created_at,
          })),
      ];
    }
  }

  return NextResponse.json(body);
}
