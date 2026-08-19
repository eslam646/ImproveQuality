"use server";

import { revalidatePath } from "next/cache";
import { requireActionPermission, requireStaff } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { renderBlocks, renderTemplate, templateVars, wrapEmail } from "@/lib/templates";
import { sendMail } from "@/lib/email";
import { settingsSchema, staffSchema, templateSchema } from "@/lib/validators";
import type { CustomFieldCfg, CustomFieldType, EstimationReminderCfg, FormFieldCfg, Role, RolePermissions, TemplateBlocks, TrackPageCfg, UrgentFormFieldCfg, UserPermissionOverrides } from "@/lib/types";
import { DEFAULT_TEMPLATE_BLOCKS } from "@/lib/types";
import { isEmail } from "@/lib/util";
import { generatePrivateToken, hashPrivateToken } from "@/lib/private-links";

// ====== القوالب ======
export async function upsertTemplateAction(input: { id?: string; name: string; subject: string; body_html: string; blocks?: TemplateBlocks | null }) {
  await requireStaff(["admin"]);
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const repo = await getRepo();
  // مهم: تمرير id حتى يكون الحفظ «تحديثاً» للقالب نفسه — بدونه كان كل حفظ ينشئ نسخة مكررة
  const t = await repo.templateUpsert({ id: input.id || undefined, ...parsed.data, blocks: input.blocks ?? null });
  revalidatePath("/templates");
  return { ok: true, id: t.id };
}

export async function deleteTemplateAction(id: string) {
  await requireStaff(["admin"]);
  const repo = await getRepo();
  await repo.templateDelete(id);
  revalidatePath("/templates");
}

export async function previewTemplateAction(subject: string, body: string, blocks?: TemplateBlocks | null) {
  await requireStaff(["admin"]);
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  const { rows } = await repo.ticketList({ pageSize: 1 });
  const t = rows[0] ?? {
    id: "x", seq: 1, code: "T-SAMPLE", client_name: "شركة المثال", client_contact: "c@x.com",
    details: "تفاصيل تجريبية للطلب.\nالسطر الثاني من التفاصيل.", created_by: null, created_by_name: "سارة محمود",
    developer_id: null, developer_name: "أحمد سمير", dev_status: "in_progress" as const,
    source: "internal" as const, last_status_change: new Date().toISOString(),
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  const vars = {
    ...templateVars(t, settings, { old_status: "new", note: "ملاحظة تجريبية" }),
    actor_name: "كريم فؤاد",
    actor_role: "فريق الاختبار",
    reason: "غير متاح حاليًا بسبب تدخل طارئ آخر",
    meeting_subject: "مراجعة مشكلة الفواتير",
    meeting_start: new Date(Date.now() + 3600000).toLocaleString("ar-EG"),
    meeting_end: new Date(Date.now() + 5400000).toLocaleString("ar-EG"),
    meeting_duration: "30 دقيقة",
    meeting_join_url: "https://teams.microsoft.com/l/meetup-join/sample",
  };
  const renderedSubject = renderTemplate(subject, vars, { htmlEscape: false });
  const intro = renderTemplate(body, vars);
  const bodyInner = renderBlocks(vars, blocks ?? DEFAULT_TEMPLATE_BLOCKS, intro);
  return {
    subject: renderedSubject,
    html: wrapEmail(renderedSubject, bodyInner, settings),
  };
}

// ====== الرقم السري للموظفين (وضع الإنتاج PIN) ======
export async function setPinAction(staffId: string, pin: string) {
  await requireStaff(["admin"]);
  const p = (pin ?? "").trim();
  if (p.length < 4) return { ok: false, error: "الرقم السري 4 أحرف على الأقل" };
  const { pinHash } = await import("@/lib/auth");
  const repo = await getRepo();
  const target = await repo.staffGet(staffId);
  if (!target) return { ok: false, error: "الموظف غير موجود" };
  await repo.staffSetPin(staffId, pinHash(p));
  revalidatePath("/staff");
  return { ok: true };
}

// ====== مصمم النماذج: إظهار/إلزام الحقول ======
export async function saveFormFieldsAction(fields: FormFieldCfg[]) {
  await requireStaff(["admin"]);
  const repo = await getRepo();
  await repo.settingsSet({ form_fields: fields });
  revalidatePath("/settings");
  revalidatePath("/tickets/new");
  revalidatePath("/submit");
  return { ok: true };
}

export async function saveUrgentFormFieldsAction(fields: UrgentFormFieldCfg[]) {
  await requireStaff(["admin"]);
  const repo = await getRepo();
  const safe = fields.map((f) => f.locked ? { ...f, visible: true, required: true } : f);
  await repo.settingsSet({ urgent_form_fields: safe });
  revalidatePath("/settings");
  revalidatePath("/instant-support");
  return { ok: true };
}

// ====== العملاء (القوائم المنسدلة) ======
export async function clientSaveAction(input: { id?: string; name: string; contact_email?: string }) {
  await requireStaff(["admin", "support"]);
  const name = (input.name ?? "").trim();
  if (name.length < 2) return { ok: false, error: "اسم العميل قصير" };
  const email = (input.contact_email ?? "").trim();
  if (email && !isEmail(email)) return { ok: false, error: "البريد الإلكتروني غير صالح" };
  const repo = await getRepo();
  const c = await repo.clientSave({ id: input.id, name, contact_email: email || null });
  revalidatePath("/staff");
  revalidatePath("/tickets/new");
  revalidatePath("/submit");
  return { ok: true, id: c.id };
}

export async function clientSetActiveAction(id: string, active: number) {
  await requireStaff(["admin", "support"]);
  const repo = await getRepo();
  await repo.clientSetActive(id, active);
  revalidatePath("/staff");
}

export async function clientDeleteAction(id: string) {
  await requireStaff(["admin"]);
  const repo = await getRepo();
  await repo.clientDelete(id);
  revalidatePath("/staff");
}

// ====== الموظفون ======
export async function upsertStaffAction(input: { id?: string; name: string; email: string; role: Role; manager_id: string }) {
  await requireStaff(["admin"]);
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const repo = await getRepo();
  const d = { ...parsed.data, manager_id: parsed.data.manager_id || null };
  if (input.id) await repo.staffUpdate(input.id, d);
  else await repo.staffCreate(d);
  revalidatePath("/staff");
  return { ok: true };
}

export async function toggleStaffAction(id: string, active: number) {
  await requireStaff(["admin"]);
  const repo = await getRepo();
  await repo.staffUpdate(id, { active });
  revalidatePath("/staff");
}

// ====== الروابط الخاصة الآمنة لمدخلي البيانات ======
export async function generatePrivateAccessLinkAction(staffId: string) {
  const actor = await requireActionPermission("manage_private_links");
  const repo = await getRepo();
  const target = await repo.staffGet(staffId);
  if (!target || target.role !== "support") return { ok: false, error: "اختر موظفاً بدور مدخل بيانات" };
  const token = generatePrivateToken();
  const link = await repo.privateLinkCreate({
    staff_id: target.id, token_hash: hashPrivateToken(token),
    label: `رابط ${target.name}`, created_by: actor.id,
  });
  const settings = await repo.settingsGet();
  await repo.auditAdd({
    entity_type: "private_access_link", entity_id: link.id, action: "private_link.created",
    actor_staff_id: actor.id, actor_label: actor.name,
    new_values: { staff_id: target.id, staff_name: target.name },
  });
  revalidatePath("/staff");
  return { ok: true, url: `${settings.base_url}/request/${token}` };
}

export async function revokePrivateAccessLinkAction(id: string) {
  const actor = await requireActionPermission("manage_private_links");
  const repo = await getRepo();
  await repo.privateLinkRevoke(id);
  await repo.auditAdd({
    entity_type: "private_access_link", entity_id: id, action: "private_link.revoked",
    actor_staff_id: actor.id, actor_label: actor.name,
  });
  revalidatePath("/staff");
  return { ok: true };
}

// ====== الإعدادات ======
export async function updateSettingsAction(input: {
  app_name: string; allow_guest_submit: boolean; sender_name: string;
  sender_email: string; stale_hours: number; base_url: string;
}) {
  await requireStaff(["admin"]);
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const repo = await getRepo();
  await repo.settingsSet(parsed.data);
  revalidatePath("/settings");
  return { ok: true };
}

// ====== سجل البريد: إعادة إرسال ======
export async function resendEmailAction(logId: string) {
  const actor = await requireActionPermission("resend_email");
  const repo = await getRepo();
  const { rows } = await repo.emailLogList(1, 1000);
  const log = rows.find((r) => r.id === logId);
  if (!log) return { ok: false, error: "غير موجود" };
  const settings = await repo.settingsGet();
  const to = log.to_addr.split(",").map((s) => s.trim()).filter(isEmail);
  const cc = (log.cc_addr ?? "").split(",").map((s) => s.trim()).filter(isEmail);
  const result = await sendMail({ to, cc, subject: log.subject, html: log.body_html }, settings);
  await repo.emailLogSetProvider(log.id, result.provider, result.msgId, result.error ? "failed" : result.provider === "log" ? "logged" : "sent", result.error ?? null);
  await repo.auditAdd({
    entity_type: "email", entity_id: log.id, action: "email.resent_original",
    actor_staff_id: actor.id, actor_label: actor.name,
    new_values: { to, cc, result: result.error ? "failed" : "sent" },
  });
  revalidatePath("/emails");
  return { ok: !result.error, error: result.error };
}

export async function resendEmailToRecipientsAction(logId: string, recipients: string[], ccRecipients: string[] = []) {
  const actor = await requireActionPermission("resend_email");
  const to = [...new Set(recipients.map((e) => e.trim().toLowerCase()).filter(isEmail))].slice(0, 20);
  const cc = [...new Set(ccRecipients.map((e) => e.trim().toLowerCase()).filter(isEmail))]
    .filter((e) => !to.includes(e)).slice(0, 20);
  if (!to.length) return { ok: false, error: "اختر مستلمًا واحدًا على الأقل" };
  const repo = await getRepo();
  const { rows } = await repo.emailLogList(1, 1000);
  const original = rows.find((r) => r.id === logId);
  if (!original) return { ok: false, error: "الرسالة الأصلية غير موجودة" };
  const settings = await repo.settingsGet();
  const subject = `إعادة إرسال: ${original.subject}`;
  const result = await sendMail({ to, cc, subject, html: original.body_html }, settings);
  const newLog = await repo.emailLogAdd({
    job_id: null, ticket_id: original.ticket_id, to_addr: to.join(","), cc_addr: cc.join(",") || null,
    provider: result.provider, provider_msg_id: result.msgId, subject, body_html: original.body_html,
    status: result.error ? "failed" : result.provider === "log" ? "logged" : "sent", error: result.error ?? null,
  });
  await repo.auditAdd({
    entity_type: "email", entity_id: newLog.id, action: "email.forwarded_to_selected_recipients",
    actor_staff_id: actor.id, actor_label: actor.name,
    old_values: { original_email_id: original.id }, new_values: { to, cc, result: result.error ? "failed" : "sent" },
  });
  revalidatePath("/emails");
  return { ok: !result.error, error: result.error };
}

// ====== مصفوفة صلاحيات الأدوار ======
export async function saveRolePermissionsAction(perms: RolePermissions) {
  await requireStaff(["admin"]);
  // حماية من قفل النظام: إعدادات المدير تُفرض مفعّلة دائماً
  const safe: RolePermissions = {
    admin: { ...perms.admin, settings: true },
    support: { ...perms.support },
    developer: { ...perms.developer },
    tester: { ...perms.tester },
  };
  const repo = await getRepo();
  await repo.settingsSet({ role_permissions: safe });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ====== تحكم صفحة الاستعلام العامة ======
export async function saveUserPermissionsAction(overrides: UserPermissionOverrides) {
  await requireStaff(["admin"]);
  const repo = await getRepo();
  // لا نسمح بمنع صفحة الإعدادات عن كل المديرين عبر استثناء فردي للمدير الحالي
  const clean = Object.fromEntries(Object.entries(overrides).map(([id, p]) => [id, { ...p }])) as UserPermissionOverrides;
  await repo.settingsSet({ user_permissions: clean });
  await repo.auditAdd({ entity_type: "settings", entity_id: "user_permissions", action: "permissions.user_overrides_updated", actor_label: "مدير النظام", new_values: { staff_count: Object.keys(clean).length } });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function saveTrackCfgAction(cfg: TrackPageCfg) {
  await requireStaff(["admin"]);
  const repo = await getRepo();
  await repo.settingsSet({ track_cfg: cfg });
  revalidatePath("/settings");
  revalidatePath("/track");
  return { ok: true };
}

// ====== تذكيرات التقدير الزمني — تحكم كامل من الإعدادات ======
export async function saveEstimationRemindersAction(cfg: EstimationReminderCfg) {
  await requireStaff(["admin"]);
  const clean: EstimationReminderCfg = {
    enabled: !!cfg.enabled,
    halfway: !!cfg.halfway,
    before_end: !!cfg.before_end,
    before_end_hours: Math.min(72, Math.max(1, Math.round(Number(cfg.before_end_hours) || 2))),
    overdue: !!cfg.overdue,
    overdue_repeat_hours: Math.min(168, Math.max(0, Math.round(Number(cfg.overdue_repeat_hours) || 0))),
    cc_admins: !!cfg.cc_admins,
    day_hours: Math.min(24, Math.max(1, Math.round(Number(cfg.day_hours) || 8))),
  };
  const repo = await getRepo();
  await repo.settingsSet({ estimation_reminders: clean });
  revalidatePath("/settings");
  return { ok: true };
}

// ====== منشئ الحقول المخصصة ======
const CF_TYPES: CustomFieldType[] = ["text", "textarea", "number", "select", "date", "file"];
export async function saveCustomFieldsAction(fields: CustomFieldCfg[]) {
  await requireStaff(["admin"]);
  if (!Array.isArray(fields) || fields.length > 30) return { ok: false, error: "الحد الأقصى 30 حقل مخصص", count: 0 };
  const seen = new Set<string>();
  const clean: CustomFieldCfg[] = [];
  for (const f of fields) {
    const label = (f.label ?? "").trim().slice(0, 80);
    if (!label) return { ok: false, error: "كل حقل يحتاج اسماً ظاهراً — أكمل أو احذف الفارغ", count: 0 };
    if (!/^[a-z][a-z0-9_]{2,40}$/.test(f.key)) return { ok: false, error: `مفتاح الحقل «${f.key}» غير صالح`, count: 0 };
    if (seen.has(f.key)) return { ok: false, error: `تكرار في مفتاح الحقل «${f.key}»`, count: 0 };
    seen.add(f.key);
    if (!CF_TYPES.includes(f.type)) return { ok: false, error: `نوع الحقل «${f.type}» غير معروف`, count: 0 };
    const options = f.type === "select" ? (f.options ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 30) : undefined;
    if (f.type === "select" && (!options || options.length < 1)) return { ok: false, error: `حقل «${label}» من نوع قائمة يحتاج خياراً واحداً على الأقل`, count: 0 };
    clean.push({ key: f.key, label, type: f.type, options, required: !!f.required, internal: !!f.internal, guest: !!f.guest });
  }
  const repo = await getRepo();
  await repo.settingsSet({ custom_fields: clean });
  revalidatePath("/settings");
  revalidatePath("/tickets/new");
  revalidatePath("/submit");
  return { ok: true, count: clean.length };
}

// ====== مفاتيح الروابط العامة (تشغيل/إيقاف فوري) ======
type PublicLinkKey = "allow_guest_submit" | "allow_track" | "allow_public_update";
export async function togglePublicLinkAction(key: PublicLinkKey, enabled: boolean) {
  await requireStaff(["admin"]);
  if (!["allow_guest_submit", "allow_track", "allow_public_update"].includes(key)) return { ok: false, error: "مفتاح غير معروف" };
  const repo = await getRepo();
  await repo.settingsSet({ [key]: !!enabled });
  revalidatePath("/settings");
  revalidatePath("/submit");
  revalidatePath("/track");
  revalidatePath("/update-form");
  return { ok: true };
}
