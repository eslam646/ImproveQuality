import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { STATUS_LABELS } from "@/lib/labels";
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
    status_label: STATUS_LABELS[t.dev_status],
  };
  if (cfg.show_last_change) body.last_status_change = t.last_status_change;
  if (cfg.show_client) body.client_name = t.client_name;
  if (cfg.show_developer) body.developer_name = t.developer_name;
  if (cfg.show_estimation && (t.est_days || t.est_hours)) {
    body.estimation = { days: t.est_days ?? null, hours: t.est_hours ?? null };
  }
  if (cfg.show_custom && t.custom_data) {
    body.custom = settings.custom_fields
      .filter((f) => t.custom_data?.[f.key])
      .map((f) => ({ label: f.label, value: t.custom_data![f.key], file: f.type === "file" }));
  }
  if (cfg.show_timeline) {
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

  return NextResponse.json(body);
}
