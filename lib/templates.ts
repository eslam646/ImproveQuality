import { escapeHtml } from "./util";
import type { Settings, TemplateBlockKey, TemplateBlocks, Ticket } from "./types";
import { DEFAULT_TEMPLATE_BLOCKS } from "./types";
import { REQUEST_TYPE_LABELS, STATUS_LABELS, TICKET_KIND_LABELS, urgentStatusInfo } from "./labels";
import type { DevStatus } from "./types";

export const BLOCK_LABELS: Record<TemplateBlockKey, string> = {
  status: "شارة الحالة الحالية (مع الحالة السابقة)",
  client: "اسم العميل",
  title: "عنوان الطلب / المشكلة",
  request_type: "نوع الطلب",
  priority: "الأولوية ونوع التذكرة",
  creator: "مدخل البيانات (مقدم الطلب)",
  tester: "التيستر المسند",
  developer: "المطور المسند",
  estimation: "التقدير الزمني",
  affected_service: "السيرفر / الخدمة المتأثرة",
  details: "تفاصيل الطلب والخطوات",
  note: "آخر ملاحظة",
  track_button: "زر «عرض الطلب»",
  update_button: "زر «تحديث الحالة»",
};

// محرك قوالب بسيط وآمن: {{ticket.client_name}} {{status_label}} ...
export function renderTemplate(
  text: string,
  vars: Record<string, string>,
  { htmlEscape = true }: { htmlEscape?: boolean } = {},
): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null) return "";
    return htmlEscape ? escapeHtml(String(v)) : String(v);
  });
}

export function templateVars(
  ticket: Ticket,
  settings: Settings,
  extra?: { old_status?: string | null; note?: string | null },
): Record<string, string> {
  const base = settings.base_url.replace(/\/$/, "");
  const priorityLabels: Record<string, string> = { low: "منخفضة", normal: "عادية", high: "مرتفعة", critical: "حرجة" };
  const fmtEst = (d?: number | null, h?: number | null) =>
    d || h ? `${d ? `${d} يوم` : ""}${d && h ? " + " : ""}${h ? `${h} ساعة` : ""}` : "غير محدد";
  // الإجمالي = تقدير الديف + تقدير التيست (يُجمع تلقائياً عند الحفظ)
  const estimation = fmtEst(ticket.est_days, ticket.est_hours);
  const devEstimation = fmtEst(ticket.dev_est_days, ticket.dev_est_hours);
  const testEstimation = fmtEst(ticket.test_est_days, ticket.test_est_hours);
  const requestType = REQUEST_TYPE_LABELS[ticket.request_type ?? "issue"];
  const ticketKind = TICKET_KIND_LABELS[ticket.ticket_kind ?? (ticket.is_urgent ? "instant_support" : "standard")];
  const priority = priorityLabels[ticket.priority ?? (ticket.is_urgent ? "critical" : "normal")];
  return {
    "ticket.code": ticket.code,
    "ticket.client_name": ticket.client_name,
    "ticket.title": ticket.title ?? "بدون عنوان",
    "ticket.request_type": requestType,
    "ticket.ticket_kind": ticketKind,
    "ticket.priority": priority,
    "ticket.details": ticket.details,
    "ticket.tester_name": ticket.tester_name ?? "غير محدد",
    "ticket.developer_name": ticket.developer_name ?? "غير محدد",
    "ticket.created_by_name": ticket.created_by_name,
    "ticket.estimation": estimation,
    "ticket.dev_estimation": devEstimation,
    "ticket.test_estimation": testEstimation,
    "ticket.affected_service": ticket.affected_service ?? "غير محدد",
    code: ticket.code,
    client_name: ticket.client_name,
    title: ticket.title ?? "بدون عنوان",
    request_type: requestType,
    ticket_kind: ticketKind,
    priority,
    tester_name: ticket.tester_name ?? "غير محدد",
    developer_name: ticket.developer_name ?? "غير محدد",
    created_by_name: ticket.created_by_name,
    estimation,
    dev_estimation: devEstimation,
    test_estimation: testEstimation,
    affected_service: ticket.affected_service ?? "غير محدد",
    status: ticket.dev_status,
    // الدعم الفوري «طلب جانبي»: حالته في الإيميلات من دورة حياته وليست حالة التطوير
    status_label: ticket.is_urgent
      ? urgentStatusInfo(ticket).label
      : STATUS_LABELS[ticket.dev_status as DevStatus] ?? ticket.dev_status,
    old_status_label: extra?.old_status
      ? STATUS_LABELS[extra.old_status as DevStatus] ?? extra.old_status
      : "",
    note: extra?.note ?? "",
    track_url: `${base}/track?code=${encodeURIComponent(ticket.code)}`,
    update_url: `${base}/update-form?code=${encodeURIComponent(ticket.code)}`,
    app_name: settings.app_name,
  };
}

// بناء جسم الإيميل من الأقسام المرئية — الأدمن يفعّل/يعطّل كل قسم من محرر القالب
export function renderBlocks(
  vars: Record<string, string>,
  blocks: TemplateBlocks,
  introHtml: string,
): string {
  const esc = escapeHtml;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 14px;color:#64748b;font-size:13px;white-space:nowrap;border-bottom:1px solid #e2e8f0;vertical-align:top">${label}</td>` +
    `<td style="padding:8px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a">${value}</td></tr>`;

  let info = row("كود الطلب", `<b dir="ltr" style="font-family:monospace">${esc(vars.code)}</b>`);
  const order = blocks.order?.length ? blocks.order : (DEFAULT_TEMPLATE_BLOCKS.order ?? []);
  for (const key of order) {
    if (key === "status" && blocks.status) info += row("الحالة الحالية", `<span style="display:inline-block;background:#dbeafe;color:#1e40af;border-radius:999px;padding:2px 12px;font-size:13px;font-weight:700">${esc(vars.status_label)}</span>${vars.old_status_label ? ` <span style="color:#94a3b8;font-size:12px">(كانت: ${esc(vars.old_status_label)})</span>` : ""}`);
    if (key === "client" && blocks.client) info += row("العميل", esc(vars.client_name));
    if (key === "title" && blocks.title) info += row("عنوان الطلب", esc(vars.title));
    if (key === "request_type" && blocks.request_type) info += row("نوع الطلب", esc(vars.request_type));
    if (key === "priority" && blocks.priority) info += row("التصنيف / الأولوية", `${esc(vars.ticket_kind)} — ${esc(vars.priority)}`);
    if (key === "creator" && blocks.creator) info += row("مدخل البيانات", esc(vars.created_by_name));
    if (key === "tester" && blocks.tester) info += row("التيستر المسند", esc(vars.tester_name));
    if (key === "developer" && blocks.developer) {
      // دعم فوري = مطور مباشر («المطور المسند») — عادي = فريق تخصصات («فريق التطوير»)
      const urgent = vars.ticket_kind === "دعم فوري";
      const label = urgent ? "المطور المسند" : "فريق التطوير";
      const value = vars.developer_name === "غير محدد"
        ? (urgent ? "غير محدد" : "لم يُسند بعد — يُسند بعد استلام التيست")
        : vars.developer_name;
      info += row(label, esc(value));
    }
    if (key === "estimation" && blocks.estimation) {
      const split = (vars.dev_estimation && vars.dev_estimation !== "غير محدد") || (vars.test_estimation && vars.test_estimation !== "غير محدد")
        ? ` <span style="color:#94a3b8;font-size:12px">(ديف: ${esc(vars.dev_estimation)} · تيست: ${esc(vars.test_estimation)})</span>`
        : "";
      info += row("التقدير الزمني الإجمالي", `${esc(vars.estimation)}${split}`);
    }
    if (key === "affected_service" && blocks.affected_service && vars.affected_service && vars.affected_service !== "غير محدد") info += row("الخدمة المتأثرة", esc(vars.affected_service));
  }

  let html = "";
  if (introHtml.trim()) html += `<p style="margin:0 0 14px">${introHtml}</p>`;
  html += `<table role="presentation" style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">${info}</table>`;

  const section = (title: string, body: string) =>
    `<div style="margin-top:14px"><div style="font-size:13px;font-weight:700;color:#475569;margin-bottom:4px">${title}</div>` +
    `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;font-size:14px;color:#0f172a;line-height:1.9">${body}</div></div>`;

  // أزرار بجداول — تظهر متناسقة في Outlook وGmail معاً
  const btn = (href: string, label: string, bg: string) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:6px 0 0 8px">
      <tr><td bgcolor="${bg}" style="border-radius:10px;mso-padding-alt:11px 20px">
        <a href="${esc(href)}" target="_blank" rel="noopener noreferrer"
           style="display:inline-block;padding:11px 20px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;white-space:nowrap">${label}</a>
      </td></tr>
    </table>`;
  for (const key of order) {
    if (key === "details" && blocks.details && vars["ticket.details"]) html += section("تفاصيل الطلب", esc(vars["ticket.details"]).replace(/\n/g, "<br>"));
    if (key === "note" && blocks.note && vars.note) html += section("آخر ملاحظة", esc(vars.note).replace(/\n/g, "<br>"));
    if (key === "track_button" && blocks.track_button) html += `<div style="margin-top:18px">${btn(vars.track_url, "🔍 عرض الطلب", "#1d4ed8")}</div>`;
    if (key === "update_button" && blocks.update_button) html += `<div style="margin-top:18px">${btn(vars.update_url, "✏️ تحديث حالة الطلب", "#0f766e")}</div>`;
  }

  return html;
}

// غلاف عربي RTL موحّد لكل الإيميلات
export function wrapEmail(subject: string, bodyHtml: string, settings: Settings): string {
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <div style="max-width:620px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#0f172a;color:#fff;padding:16px 24px;font-size:18px;font-weight:700;">${escapeHtml(settings.app_name)}</div>
    <div style="padding:24px;line-height:1.8;color:#0f172a;font-size:15px;">${bodyHtml}</div>
    <div style="padding:14px 24px;background:#f8fafc;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;">
      هذا البريد أُرسل تلقائياً من نظام ${escapeHtml(settings.app_name)} — لا ترد على هذه الرسالة.
    </div>
  </div>
</body></html>`;
}
