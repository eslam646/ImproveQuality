"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canManage, requireActionPermission, requirePerm, requireStaff } from "@/lib/auth";
import {
  addNoteOp, assignDeveloperOp, assignTesterOp, changeStatusOp, createTicketOp,
  declineAssignmentOp, respondToAssignmentOp, setEstimationOp, updateUrgentProgressOp,
} from "@/lib/ops";
import { getRepo } from "@/lib/db";
import type { DevStatus, RequestType } from "@/lib/types";
import { allowedTransitions, ALL_STATUSES, NOTE_REQUIRED_STATUSES, ROLE_LABELS } from "@/lib/labels";
import { hashPrivateToken } from "@/lib/private-links";

function enc(msg: string) { return encodeURIComponent(msg); }
// التقاط الأخطاء غير المتوقعة وعرضها برسالة بدل خطأ 500 — وأيضاً تكشف سبب أي فشل فعلي
function failMsg(e: unknown): string { const m = e instanceof Error ? e.message : String(e); return m.slice(0, 140); }
const labelOf = (a: { name: string; role: keyof typeof ROLE_LABELS }) => `${a.name} (${ROLE_LABELS[a.role]})`;

function estFromForm(formData: FormData) {
  const d = parseFloat(String(formData.get("est_days") ?? ""));
  const h = parseFloat(String(formData.get("est_hours") ?? ""));
  return {
    days: Number.isFinite(d) && d >= 0 ? d : null,
    hours: Number.isFinite(h) && h >= 0 ? h : null,
  };
}

// ═══ إنشاء طلب من رابط خاص — هوية مدخل البيانات مثبتة بالـToken ═══
export async function createPrivateRequestAction(formData: FormData) {
  const token = String(formData.get("access_token") ?? "").trim();
  const back = `/request/${encodeURIComponent(token)}`;
  const fail = (msg: string): never => redirect(`${back}?err=${enc(msg)}`);
  if (token.length < 32) fail("الرابط الخاص غير صالح");
  const repo = await getRepo();
  const link = await repo.privateLinkByHash(hashPrivateToken(token));
  if (!link || (link.kind ?? "request") !== "request") fail("الرابط الخاص غير صالح أو تم إلغاؤه");
  const requester = await repo.staffGet(link!.staff_id);
  if (!requester || !requester.active || requester.role !== "support") fail("حساب مدخل البيانات غير متاح");

  const clientId = String(formData.get("client_id") ?? "").trim();
  const client = (await repo.clientsList(true)).find((c) => c.id === clientId);
  const requestType = String(formData.get("request_type") ?? "issue") as RequestType;
  const title = String(formData.get("title") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  const testerId = String(formData.get("tester_id") ?? "").trim();
  const linkedCode = String(formData.get("linked_ticket_code") ?? "").trim();
  if (!client) fail("اختيار العميل إجباري");
  if (!["new_development", "change_request", "issue"].includes(requestType)) fail("نوع الطلب غير صحيح");
  if (title.length < 3) fail("عنوان الطلب إجباري");
  if (details.length < 10) fail("اكتب التفاصيل والخطوات بوضوح");
  if (!testerId) fail("اختيار مسؤول الاختبار إجباري");
  const tester = await repo.staffGet(testerId);
  if (!tester || tester.role !== "tester" || !tester.active) fail("مسؤول الاختبار غير صحيح");
  const linked = linkedCode ? await repo.ticketByCode(linkedCode) : null;
  if (requestType === "change_request" && !linked) fail("كود الطلب السابق غير موجود");

  const ticket = await createTicketOp({
    client_id: client!.id, client_name: client!.name, client_contact: requester!.email,
    title, details, request_type: requestType, ticket_kind: "standard", priority: "normal",
    linked_ticket_id: linked?.id ?? null, tester_id: tester!.id,
    creator_id: requester!.id, actor: { staff_id: requester!.id, label: requester!.name }, source: "web_guest",
  });
  await repo.privateLinkTouch(link!.id);
  revalidatePath("/dashboard");
  redirect(`${back}?created=${enc(ticket.code)}`);
}

// ═══ إنشاء طلب (داخلي) ═══
export async function createTicketAction(formData: FormData) {
  const actor = await requireActionPermission("create_standard_ticket");
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  const cfg = settings.form_fields;
  const show = (k: string) => cfg.find((f) => f.key === k)?.visible ?? true;
  const need = (k: string) => show(k) && (cfg.find((f) => f.key === k)?.required ?? false);

  const client_id = String(formData.get("client_id") ?? "").trim();
  let client_name = String(formData.get("client_name") ?? "").trim();
  if (client_id) {
    const c = (await repo.clientsList()).find((x) => x.id === client_id);
    if (c) {
      client_name = c.name;
      if (c.contact_email && !String(formData.get("client_contact") ?? "").trim()) {
        formData.set("client_contact", c.contact_email);
      }
    }
  }
  const client_contact = String(formData.get("client_contact") ?? "").trim();
  const request_type = String(formData.get("request_type") ?? "issue") as RequestType;
  const title = String(formData.get("title") ?? "").trim();
  const linked_ticket_code = String(formData.get("linked_ticket_code") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  const developer_id = String(formData.get("developer_id") ?? "").trim();
  const tester_id = String(formData.get("tester_id") ?? "").trim();
  const creator_id = String(formData.get("creator_id") ?? "").trim() || actor.id;

  const fail = (msg: string): never => redirect(`/tickets/new?err=${enc(msg)}`);
  if (need("client") && !client_id && client_name.length < 2) fail("اسم العميل إجباري — اختر من القائمة أو اكتبه");
  if (need("client_contact") && !client_contact) fail("بريد مدخل البيانات إجباري");
  if (!["new_development", "change_request", "issue"].includes(request_type)) fail("نوع الطلب غير صحيح");
  if (title.length < 3) fail("عنوان الطلب / المشكلة إجباري (3 أحرف على الأقل)");
  if (need("details") && details.length < 10) fail("اكتب تفاصيل وخطوات كافية للطلب (10 أحرف على الأقل)");
  if (need("developer") && !developer_id) fail("إسناد المطور إجباري");
  if (client_name.length < 2) fail("اختر العميل من القائمة أو اكتب اسمه");
  if (details.length < 10) fail("اكتب تفاصيل وخطوات كافية للطلب");
  if (!tester_id) fail("اختيار فريق الاختبار إجباري قبل إرسال الطلب");
  if (request_type === "change_request" && !linked_ticket_code) fail("اكتب كود الطلب السابق المطلوب تعديله");
  // القاعدة الذهبية: لا مطوّر قبل المختبِر أولاً
  if (developer_id && !tester_id) fail("حدّد فريق الاختبار أولاً — لا يُسنَد المطوّر إلا بعد التيست");

  // المرفق (اختياري/إجباري حسب تصميم النموذج) — يُرفع من المتصفح ويصل كمرجع «اسم|رابط»
  const attachment_ref = String(formData.get("attachment_ref") ?? "").trim();
  if (show("attachment") && need("attachment") && !/^[^|]{1,200}\|(https?:\/\/|local:\/\/)/.test(attachment_ref)) {
    fail("المرفق إجباري — ارفع صورة أو فيديو أو ملفاً يوضح الطلب");
  }

  // الحقول المخصصة الظاهرة في النموذج الداخلي (cf_<key>) — مع تحقق الإجبارية
  const custom: Record<string, string> = {};
  for (const cf of settings.custom_fields.filter((f) => f.internal)) {
    const v = String(formData.get(`cf_${cf.key}`) ?? "").trim().slice(0, 500);
    if (cf.required && !v) fail(`حقل «${cf.label}» إجباري`);
    if (v && cf.type === "file" && !/^[^|]{1,100}\|(https?:\/\/|local:\/\/)/.test(v)) {
      fail(`حقل «${cf.label}»: تعذر قبول الملف — أعد رفعه`);
    }
    if (v) custom[cf.key] = v;
  }

  // الحماية: غير الأدمن يُسجل الطلب باسمه هو دائماً مهما أُرسل في النموذج
  const creator = actor.role === "admin" ? ((await repo.staffGet(creator_id)) ?? actor) : actor;
  const label = creator.id === actor.id ? creator.name : `${creator.name} (أدخله ${actor.name})`;
  const linkedTicket = linked_ticket_code ? await repo.ticketByCode(linked_ticket_code) : null;
  if (request_type === "change_request" && !linkedTicket) fail("كود الطلب السابق غير موجود");
  const ticket = await createTicketOp({
    client_name,
    client_contact: client_contact || creator.email || null,
    title,
    details,
    request_type,
    ticket_kind: "standard",
    priority: "normal",
    linked_ticket_id: linkedTicket?.id ?? null,
    // التوحيد: الطلب العادي بلا ديف مباشر — التطوير يُسند من كارت التخصصات بعد تسليم التيست
    developer_id: null,
    tester_id: tester_id || null,
    is_urgent: formData.get("is_urgent") === "1",
    actor: { staff_id: creator.id, label }, source: "internal",
    custom_data: custom,
  });
  // حفظ المرفق المرفوع مع الطلب وتسجيله في سجل الأحداث
  if (attachment_ref && attachment_ref.includes("|")) {
    const [attName, attUrl] = [attachment_ref.slice(0, attachment_ref.indexOf("|")), attachment_ref.slice(attachment_ref.indexOf("|") + 1)];
    if (attName && attUrl) {
      const { genId } = await import("@/lib/util");
      const isLocal = attUrl.startsWith("local://");
      await repo.attachmentAdd({
        id: genId("att"), ticket_id: ticket.id, file_name: attName, size_bytes: 0,
        path: isLocal ? attUrl.replace("local://", "") : attUrl, driver: isLocal ? "local" : "supabase", uploaded_by: creator.name,
      });
      await repo.eventAdd({
        ticket_id: ticket.id, type: "attachment.added", actor_label: label,
        old_values: null, new_values: { file: attName },
      });
    }
  }
  revalidatePath("/dashboard");
  redirect(`/tickets/${ticket.code}?created=1`);
}

// ═══ دعم فوري — مسار مستقل، ويشترط تعيين التيست والمطور ═══
export async function createInstantSupportAction(formData: FormData) {
  const actor = await requireActionPermission("create_instant_support");
  const repo = await getRepo();
  const client_id = String(formData.get("client_id") ?? "").trim();
  let client_name = String(formData.get("client_name") ?? "").trim();
  const creator_id = String(formData.get("creator_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  const affected_service = String(formData.get("affected_service") ?? "").trim();
  const tester_id = String(formData.get("tester_id") ?? "").trim();
  const developer_id = String(formData.get("developer_id") ?? "").trim();
  const fail = (msg: string): never => redirect(`/instant-support?err=${enc(msg)}`);
  const urgentCfg = (await repo.settingsGet()).urgent_form_fields;
  const required = (key: string) => urgentCfg.find((f) => f.key === key)?.required ?? false;
  const visible = (key: string) => urgentCfg.find((f) => f.key === key)?.visible ?? true;

  if (client_id) {
    const c = (await repo.clientsList()).find((x) => x.id === client_id);
    if (c) client_name = c.name;
  }
  // الحماية: غير الأدمن يسجل الدعم الفوري باسمه هو دائماً
  const requester = actor.role === "admin"
    ? await repo.staffGet(creator_id)
    : actor;
  if (!requester || !requester.active || !["support", "admin"].includes(requester.role)) fail("اختيار مدخل البيانات إجباري");
  if (client_name.length < 2) fail("اختر العميل أو اكتب اسمه");
  if (title.length < 3) fail("عنوان المشكلة الطارئة إجباري");
  if (visible("affected_service") && required("affected_service") && affected_service.length < 2) fail("حدد السيرفر أو قاعدة البيانات أو الخدمة المتأثرة");
  if (details.length < 10) fail("اكتب تفاصيل المشكلة الطارئة وخطواتها بوضوح");
  // التيست والديف: الإجبارية من إعدادات نموذج الدعم الفوري — والإخفاء يلغي الإجبارية تلقائياً
  const attachment_ref = String(formData.get("attachment_ref") ?? "").trim();
  if (visible("attachment") && required("attachment") && !/^[^|]{1,200}\|(https?:\/\/|local:\/\/)/.test(attachment_ref)) {
    fail("المرفق إجباري في الدعم الفوري — ارفع صورة أو فيديو أو ملف لوج يوضح المشكلة");
  }
  if (visible("tester") && required("tester") && !tester_id) fail("اختيار مسؤول الاختبار إجباري في الدعم الفوري");
  if (visible("developer") && required("developer") && !developer_id) fail("اختيار المطور إجباري في الدعم الفوري");
  if (!tester_id && !developer_id) fail("اختر التيست أو المطور على الأقل — لا يصح دعم فوري بلا مكلَّف");

  const ticket = await createTicketOp({
    client_name,
    client_contact: requester!.email,
    creator_id: requester!.id,
    title,
    details,
    request_type: "issue",
    ticket_kind: "instant_support",
    priority: "critical",
    urgent_reason: details,
    affected_service: visible("affected_service") && affected_service ? affected_service : null,
    tester_id: tester_id || null,
    developer_id: developer_id || null,
    is_urgent: true,
    actor: { staff_id: actor.id, label: labelOf(actor) },
    source: "internal",
  });
  // ربط المرفق المرفوع مسبقاً بالطلب — يظهر في قائمة المرفقات مباشرة
  if (attachment_ref) {
    const [attName, attUrl] = [attachment_ref.slice(0, attachment_ref.indexOf("|")), attachment_ref.slice(attachment_ref.indexOf("|") + 1)];
    if (attName && attUrl) {
      const { genId } = await import("@/lib/util");
      const isLocal = attUrl.startsWith("local://");
      await repo.attachmentAdd({
        id: genId("att"), ticket_id: ticket.id, file_name: attName, size_bytes: 0,
        path: isLocal ? attUrl.replace("local://", "") : attUrl, driver: isLocal ? "local" : "supabase", uploaded_by: requester!.name,
      });
      await repo.eventAdd({
        ticket_id: ticket.id, type: "attachment.added", actor_label: requester!.name,
        old_values: null, new_values: { file: attName },
      });
    }
  }
  revalidatePath("/dashboard");
  redirect(`/tickets/${ticket.code}?created=1&ok=${enc("تم إنشاء طلب الدعم الفوري وإرسال التكليف ✓")}`);
}

// ═══ إسناد التيست (أولاً دائماً) + تقدير التنفيذ ═══
export async function assignTesterAction(formData: FormData) {
  const actor = await requireActionPermission("assign_tester");
  const code = String(formData.get("code") ?? "");
  const testerId = String(formData.get("tester_id") ?? "");
  const repo = await getRepo();
  const t = await repo.ticketByCode(code);
  if (t?.dev_status === "rejected") {
    redirect(`/tickets/${code}?err=${enc("الطلب مرفوض نهائياً — لا إسناد عليه. مدخل البيانات يعدّل بياناته ويعيد إرساله لتبدأ الدورة من جديد")}`);
  }
  // الدعم الفوري: إعادة الإسناد فقط عندما تكون الخانة شاغرة (اعتذار/رفض) — لا تبديل أثناء العمل أو بعد الإقفال
  if (t?.is_urgent) {
    if (t.urgent_ended_at) redirect(`/tickets/${code}?err=${enc("الدعم الفوري أُقفل — لا إسناد بعد الإقفال")}`);
    if (t.tester_id) redirect(`/tickets/${code}?err=${enc("التيست الحالي مازال مكلفاً — الإسناد الجديد يُتاح فقط بعد اعتذاره أو رفضه")}`);
  }
  try {
    if (t && testerId) await assignTesterOp(t.id, testerId, labelOf(actor), estFromForm(formData), actor.id);
  } catch (e) {
    redirect(`/tickets/${code}?err=${enc(`تعذر إسناد التيست: ${failMsg(e)}`)}`);
  }
  revalidatePath(`/tickets/${code}`);
  redirect(`/tickets/${code}?ok=${enc("تم تعيين فريق الاختبار وإرسال الإشعارات ✓")}`);
}

// ═══ إسناد المطوّر — مسموح بعد تعيين التيست فقط ═══
export async function assignDeveloperAction(formData: FormData) {
  const actor = await requireActionPermission("assign_developer");
  const code = String(formData.get("code") ?? "");
  const developerId = String(formData.get("developer_id") ?? "");
  const repo = await getRepo();
  const t = await repo.ticketByCode(code);
  if (!t) redirect("/dashboard");

  // الدعم الفوري: إعادة إسناد الديف فقط عندما تكون الخانة شاغرة — لا تبديل أثناء العمل أو بعد الإقفال
  if (t.is_urgent) {
    if (t.urgent_ended_at) redirect(`/tickets/${code}?err=${enc("الدعم الفوري أُقفل — لا إسناد بعد الإقفال")}`);
    if (t.developer_id) redirect(`/tickets/${code}?err=${enc("الديف الحالي مازال مكلفاً — الإسناد الجديد يُتاح فقط بعد اعتذاره أو رفضه")}`);
  }

  // القاعدة الذهبية: لا مطوّر قبل المختبِر أولاً (للطلبات العادية)
  if (!t.is_urgent && !t.tester_id) {
    redirect(`/tickets/${code}?err=${enc("حدّد فريق الاختبار أولاً — لا يُسنَد المطوّر إلا بعد التيست")}`);
  }
  try {
    if (developerId) await assignDeveloperOp(t.id, developerId, labelOf(actor), estFromForm(formData), actor.id);
  } catch (e) {
    redirect(`/tickets/${code}?err=${enc(`تعذر إسناد المطور: ${failMsg(e)}`)}`);
  }
  revalidatePath(`/tickets/${code}`);
  redirect(`/tickets/${code}?ok=${enc("تم تعيين المطور وإرسال الإشعارات ✓")}`);
}

// ═══ قبول/رفض التكليف — مستقل للتيستر والمطور ═══
export async function respondToAssignmentAction(formData: FormData) {
  const actor = await requireActionPermission("assignment_decision", ["tester", "developer"]);
  const code = String(formData.get("code") ?? "");
  const decision = String(formData.get("decision") ?? "") as "accepted" | "declined";
  const reason = String(formData.get("reason") ?? "").trim();
  if (!["accepted", "declined"].includes(decision)) redirect(`/tickets/${code}?err=${enc("قرار التكليف غير صحيح")}`);
  if (decision === "declined" && reason.length < 3) {
    redirect(`/tickets/${code}?err=${enc("سبب رفض التكليف إجباري ويُرسل في الإيميل")}`);
  }
  const repo = await getRepo();
  const ticket = await repo.ticketByCode(code);
  if (!ticket) redirect("/dashboard");
  const result = await respondToAssignmentOp(
    ticket.id,
    { staff_id: actor.id, name: actor.name, role: actor.role },
    decision,
    reason || undefined,
  );
  revalidatePath(`/tickets/${code}`);
  revalidatePath("/dashboard");
  redirect(`/tickets/${code}?${result.ok ? `ok=${enc(decision === "accepted" ? "تم قبول التكليف وإبلاغ المسؤولين ✓" : "تم رفض التكليف وإبلاغ المسؤولين بالسبب ✓")}` : `err=${enc(result.error ?? "تعذر تسجيل القرار")}`}`);
}

// ═══ الاعتذار عن الدعم الفوري بعد القبول (التيست/الديف) بسبب إجباري ═══
export async function declineAssignmentAction(formData: FormData) {
  const actor = await requireActionPermission("assignment_decision", ["tester", "developer"]);
  const code = String(formData.get("code") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const repo = await getRepo();
  const t = await repo.ticketByCode(code);
  if (!t) redirect("/dashboard");
  if (!t.is_urgent) {
    redirect(`/tickets/${code}?err=${enc("الاعتذار متاح لطلبات الدعم الفوري فقط — التذاكر العادية تُدار بتغيير الحالة والملاحظات")}`);
  }
  if (reason.length < 3) {
    redirect(`/tickets/${code}?err=${enc("سبب الاعتذار إجباري — اكتبه بوضوح ليصل لمقدم الطلب والإدارة")}`);
  }
  const r = await declineAssignmentOp(t.id, { staff_id: actor.id, name: actor.name, role: actor.role }, reason);
  revalidatePath(`/tickets/${code}`);
  redirect(`/tickets/${code}?${r.ok ? `ok=${enc("تم تسجيل اعتذارك وإبلاغ مدخل البيانات والإدارة ✓")}` : `err=${enc(r.error ?? "تعذر الاعتذار")}`}`);
}

// ═══ الدعم الفوري «طلب جانبي» — تحديث الموقف: مازلت أعمل / انتهيت فينتهي الدعم ═══
export async function updateUrgentProgressAction(formData: FormData) {
  const actor = await requireActionPermission("update_urgent_progress", ["tester", "developer", "admin"]);
  const code = String(formData.get("code") ?? "");
  const progress = String(formData.get("progress") ?? "") as "still_working" | "done";
  const note = String(formData.get("note") ?? "").trim();
  if (!["still_working", "done"].includes(progress)) redirect(`/tickets/${code}?err=${enc("تحديث الموقف غير صحيح")}`);
  const repo = await getRepo();
  const t = await repo.ticketByCode(code);
  if (!t) redirect("/dashboard");
  const r = await updateUrgentProgressOp(
    t.id,
    { staff_id: actor.id, name: actor.name, role: actor.role },
    progress,
    note || undefined,
  );
  revalidatePath(`/tickets/${code}`);
  revalidatePath("/dashboard");
  redirect(`/tickets/${code}?${r.ok
    ? `ok=${enc(progress === "done" ? "تم إنهاء الدعم الفوري لهذه النقطة وإبلاغ مدخل البيانات والإدارة ✓" : "تم تسجيل أنك مازلت تعمل على هذه النقطة وإبلاغ المعنيين ✓")}`
    : `err=${enc(r.error ?? "تعذر تحديث الموقف")}`}`);
}

// ═══ تحديث تقدير التنفيذ — تقدير الديف وتقدير التيست منفصلان والإجمالي يُجمع تلقائياً ═══
export async function setEstimationAction(formData: FormData) {
  const actor = await requireStaff();
  const code = String(formData.get("code") ?? "");
  const repo = await getRepo();
  const t = await repo.ticketByCode(code);
  if (!t) redirect("/dashboard");
  const { permissionsForStaff } = await import("@/lib/auth");
  const perms = await permissionsForStaff(actor);
  // التيستر المسند يضع تقدير التيست بنفسه (زي المتخصص) — وصاحب صلاحية التقدير يضع الكل
  const isAssignedTester = t.tester_id === actor.id;
  if (!perms.set_estimation && !isAssignedTester) {
    redirect(`/tickets/${code}?err=${enc("صلاحية التقدير غير مفعّلة لدورك — التيستر المسند يضع تقدير التيست فقط")}`);
  }
  if (t.is_urgent) {
    redirect(`/tickets/${code}?err=${enc("الدعم الفوري بلا تقدير زمني — يُقاس بالوقت الفعلي المستخدم لكل شخص تلقائياً")}`);
  }
  const num = (k: string) => { const v = parseFloat(String(formData.get(k) ?? "")); return Number.isFinite(v) && v >= 0 ? v : null; };
  let dev = { days: num("dev_est_days"), hours: num("dev_est_hours") };
  const test = { days: num("test_est_days"), hours: num("test_est_hours") };
  // التيستر بلا صلاحية تقدير: يضع تقدير التيست فقط — حقول الديف تُتجاهل
  if (!perms.set_estimation) dev = { days: null, hours: null };
  // بدأ الاختبار الفعلي؟ تقدير التيست مجمّد على التيستر (المدير يصحح إدارياً)
  if (t.test_started_at && !perms.set_estimation && (test.days != null || test.hours != null)) {
    redirect(`/tickets/${code}?err=${enc("بدأ الاختبار الفعلي — تقدير التيست مجمّد بعد البدء (المدير فقط يعدّله)")}`);
  }
  const hasSplit = dev.days != null || dev.hours != null || test.days != null || test.hours != null;
  await setEstimationOp(t.id, hasSplit
    ? { dev: (dev.days != null || dev.hours != null) ? dev : undefined, test: (test.days != null || test.hours != null) ? test : undefined }
    : estFromForm(formData));
  revalidatePath(`/tickets/${code}`);
  redirect(`/tickets/${code}?ok=${enc("تم تحديث التقدير — الإجمالي جُمع تلقائياً ✓")}`);
}

// ═══ تغيير الحالة — بملاحظة إجبارية عند الرفض/فشل الاختبار ═══
export async function changeStatusAction(formData: FormData) {
  const actor = await requireActionPermission("change_status");
  const code = String(formData.get("code") ?? "");
  const status = String(formData.get("dev_status") ?? "") as DevStatus;
  const note = String(formData.get("note") ?? "");
  const repo = await getRepo();
  const t = await repo.ticketByCode(code);
  if (!t) redirect("/dashboard");
  // الدعم الفوري «طلب جانبي»: لا حالة تطوير له — يُدار من «موقف الدعم الفوري» فقط
  if (t.is_urgent) {
    redirect(`/tickets/${code}?err=${enc("الدعم الفوري لا يمر بحالات التطوير — استخدم «موقف الدعم الفوري»: مازلت أعمل / انتهيت، أو الاعتذار")}`);
  }
  const { permissionsForStaff: permsOf } = await import("@/lib/auth");
  const actorPerms = await permsOf(actor);
  const allowed = actor.role === "support" ? ALL_STATUSES.filter((s) => s !== t.dev_status) : allowedTransitions(actor.role, t.dev_status, { closeAfterPass: !!actorPerms.close_after_pass });
  if (!allowed.includes(status)) {
    redirect(`/tickets/${code}?err=${enc("غير مصرح لك بهذا التحويل")}`);
  }
  if (NOTE_REQUIRED_STATUSES.includes(status) && note.trim().length < 3) {
    const what = status === "rejected" ? "سبب الرفض" : "سبب فشل الاختبار / المشكلة للمطور";
    redirect(`/tickets/${code}?err=${enc(`${what} إجباري — يُرسل في الإيميل`)}`);
  }
  await changeStatusOp(t.id, status, labelOf(actor), note || undefined, actor.id);
  revalidatePath(`/tickets/${code}`);
  redirect(`/tickets/${code}?ok=${enc("تم تحديث الحالة وإطلاق الإشعارات ✓")}`);
}

// ═══ نتيجة الاختبار من واجهة الاختبار ═══
export async function testerResultAction(formData: FormData) {
  const actor = await requireStaff(["tester", "admin"]);
  const code = String(formData.get("code") ?? "");
  const result = String(formData.get("result") ?? "") as DevStatus;
  const note = String(formData.get("note") ?? "").trim();
  const repo = await getRepo();
  const t = await repo.ticketByCode(code);
  if (!t) redirect("/testing");
  // «جاهز للاختبار» → يبدأ بـ«جاري الاختبار» (يبدأ عدّاد تقدير التيست) — ثم يحكم بالنجاح/الفشل
  if (result === "testing") {
    if (t.dev_status !== "ready_for_test") redirect(`/testing?err=${enc("هذه التذكرة ليست جاهزة لبدء الاختبار")}`);
    await changeStatusOp(t.id, "testing", labelOf(actor), undefined, actor.id);
    revalidatePath("/testing");
    redirect(`/testing?ok=${enc("بدأ الاختبار — عدّاد تقدير التيست انطلق ⏱️")}`);
  }
  if (!["ready_for_test", "testing"].includes(t.dev_status) || !["test_passed", "test_failed"].includes(result)) {
    redirect(`/testing?err=${enc("هذه التذكرة ليست في انتظار الاختبار")}`);
  }
  if (result === "test_failed" && note.length < 3) {
    redirect(`/testing?err=${enc("اكتب سبب فشل الاختبار / وصف المشكلة — يُرسل للمطوّر إجبارياً")}`);
  }
  await changeStatusOp(t.id, result, labelOf(actor), note || undefined, actor.id);
  revalidatePath("/testing");
  redirect(`/testing?ok=${enc(result === "test_passed" ? "تم اعتماد التذكرة ✓" : "سُجل فشل الاختبار وأُبلغ المطور بالسبب ✓")}`);
}

// ═══ ملاحظة/رد — مفتوح لكل أطراف الطلب (مدخل بيانات ↔ التيست ↔ الديف ↔ الإدارة) ═══
export async function addNoteAction(formData: FormData) {
  const actor = await requireActionPermission("add_note");
  const code = String(formData.get("code") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const repo = await getRepo();
  const t = await repo.ticketByCode(code);
  if (!t) redirect("/dashboard");
  const isParty = actor.role === "admin" || t.created_by === actor.id || t.tester_id === actor.id || t.developer_id === actor.id;
  if (!isParty) {
    redirect(`/tickets/${code}?err=${enc("إضافة الملاحظات متاحة لمقدم الطلب والمسؤولين المسندين إليه فقط")}`);
  }
  if (note.length >= 2) await addNoteOp(t.id, note, labelOf(actor), actor.role, actor.id);
  revalidatePath(`/tickets/${code}`);
  redirect(`/tickets/${code}?ok=${enc("أُضيفت ملاحظتك وأُرسلت لكل أطراف الطلب ✓")}`);
}

export async function canManageGuard() {
  const actor = await requireStaff();
  return canManage(actor);
}

// ═══════════ المتخصصون (باك/فرونت/UX) ═══════════
// إسناد متخصص — بصلاحية «إسناد / تغيير المطور»
export async function assignSpecialistAction(formData: FormData) {
  const actor = await requireActionPermission("assign_developer");
  const code = String(formData.get("code") ?? "");
  const specKey = String(formData.get("spec_key") ?? "");
  const staffId = String(formData.get("staff_id") ?? "");
  const d = parseFloat(String(formData.get("est_days") ?? ""));
  const h = parseFloat(String(formData.get("est_hours") ?? ""));
  const repo = await getRepo();
  const t = await repo.ticketByCode(code);
  if (!t) redirect("/dashboard");
  const { assignSpecialistOp } = await import("@/lib/ops");
  const r = await assignSpecialistOp(
    t.id, specKey, staffId,
    { days: Number.isFinite(d) && d >= 0 ? d : null, hours: Number.isFinite(h) && h >= 0 ? h : null },
    labelOf(actor), actor.id,
  );
  revalidatePath(`/tickets/${code}`);
  redirect(`/tickets/${code}?${r.ok ? `ok=${enc("تم إسناد المتخصص وإرسال التكليف ✓")}` : `err=${enc(r.error ?? "تعذر الإسناد")}`}`);
}

// قرار المتخصص: قبول / رفض
export async function respondSpecialistAction(formData: FormData) {
  const actor = await requireStaff(["developer", "admin"]);
  const code = String(formData.get("code") ?? "");
  const specialistId = String(formData.get("specialist_id") ?? "");
  const decision = String(formData.get("decision") ?? "") as "accepted" | "declined";
  const reason = String(formData.get("reason") ?? "").trim();
  if (!["accepted", "declined"].includes(decision)) redirect(`/tickets/${code}?err=${enc("قرار غير صحيح")}`);
  const { respondSpecialistOp } = await import("@/lib/ops");
  const r = await respondSpecialistOp(specialistId, { staff_id: actor.id, name: actor.name }, decision, reason || undefined);
  revalidatePath(`/tickets/${code}`);
  redirect(`/tickets/${code}?${r.ok ? `ok=${enc(decision === "accepted" ? "قبلت التكليف ✓ — اضغط «أبدأ الشغل» عندما تبدأ فعلياً ليبدأ عدّادك" : "سُجل رفضك وأُبلغت الإدارة بالسبب ✓")}` : `err=${enc(r.error ?? "تعذر التسجيل")}`}`);
}

// المتخصص يبدأ الشغل فعلياً — يبدأ عدّاده وتتحول التاسك «قيد التطوير»
export async function specialistStartAction(formData: FormData) {
  const actor = await requireStaff(["developer", "admin"]);
  const code = String(formData.get("code") ?? "");
  const specialistId = String(formData.get("specialist_id") ?? "");
  const { specialistStartOp } = await import("@/lib/ops");
  const r = await specialistStartOp(specialistId, { staff_id: actor.id, name: actor.name });
  revalidatePath(`/tickets/${code}`);
  redirect(`/tickets/${code}?${r.ok ? `ok=${enc("🚀 بدأت الشغل — عدّاد تقديرك يعمل الآن والتاسك قيد التطوير")}` : `err=${enc(r.error ?? "تعذر التسجيل")}`}`);
}

// المتخصص يحدد/يعدل تقدير جزئه — أو أي شخص يملك صلاحية «تعديل التقدير» (أدمن مثلاً)
export async function setSpecialistEstimateAction(formData: FormData) {
  const actor = await requireStaff();
  const code = String(formData.get("code") ?? "");
  const specialistId = String(formData.get("specialist_id") ?? "");
  const days = parseFloat(String(formData.get("est_days") ?? "")) || null;
  const hours = parseFloat(String(formData.get("est_hours") ?? "")) || null;
  const { permissionsForStaff } = await import("@/lib/auth");
  const perms = await permissionsForStaff(actor);
  const { setSpecialistEstimateOp } = await import("@/lib/ops");
  const r = await setSpecialistEstimateOp(
    specialistId,
    { staff_id: actor.id, name: actor.name, canEstimateOthers: !!perms.set_estimation },
    { days, hours },
  );
  revalidatePath(`/tickets/${code}`);
  redirect(`/tickets/${code}?${r.ok ? `ok=${enc("⏱️ سُجل تقدير الجزء وأُعيد حساب الإجمالي ✓")}` : `err=${enc(r.error ?? "تعذر التسجيل")}`}`);
}

// المتخصص يعلن الجاهزية — ولو الجميع جاهز تتحول التاسك «جاهز للاختبار»
export async function specialistReadyAction(formData: FormData) {
  const actor = await requireStaff(["developer", "admin"]);
  const code = String(formData.get("code") ?? "");
  const specialistId = String(formData.get("specialist_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const { specialistReadyOp } = await import("@/lib/ops");
  const r = await specialistReadyOp(specialistId, { staff_id: actor.id, name: actor.name }, note || undefined);
  revalidatePath(`/tickets/${code}`);
  redirect(`/tickets/${code}?${r.ok
    ? `ok=${enc(r.allReady ? "🎉 كل التخصصات جاهزة — تحولت التاسك لجاهز للاختبار وأُبلغ التيست" : "سُجلت جاهزية جزئك ✓ — التاسك تتحول للاختبار بعد جاهزية الباقين")}`
    : `err=${enc(r.error ?? "تعذر التسجيل")}`}`);
}

// إزالة متخصص من الطلب — بصلاحية «إسناد / تغيير المطور»؛ يُبلَّغ المُزال بالإيميل
export async function removeSpecialistAction(formData: FormData) {
  const actor = await requireActionPermission("assign_developer");
  const code = String(formData.get("code") ?? "");
  const specialistId = String(formData.get("specialist_id") ?? "");
  const { removeSpecialistOp } = await import("@/lib/ops");
  const r = await removeSpecialistOp(specialistId, labelOf(actor), actor.id);
  revalidatePath(`/tickets/${code}`);
  redirect(`/tickets/${code}?${r.ok ? `ok=${enc("أُزيل المتخصص وأُبلغ بالإيميل ✓")}` : `err=${enc(r.error ?? "تعذر الإزالة")}`}`);
}

// ═══ إعادة إرسال طلب مرفوض — صاحب الطلب يعدّل ويعيد والدورة تبدأ من جديد ═══
export async function resubmitTicketAction(formData: FormData) {
  const actor = await requireStaff();
  const code = String(formData.get("code") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  const repo = await getRepo();
  const t = await repo.ticketByCode(code);
  if (!t) redirect("/dashboard");
  const { resubmitTicketOp } = await import("@/lib/ops");
  const r = await resubmitTicketOp(t.id, { staff_id: actor.id, name: actor.name, role: actor.role }, { title, details });
  revalidatePath(`/tickets/${code}`);
  revalidatePath("/dashboard");
  redirect(`/tickets/${code}?${r.ok ? `ok=${enc("أُعيد إرسال الطلب بعد التعديل ✓ — الدورة بدأت من جديد وأُبلغ التيستر")}` : `err=${enc(r.error ?? "تعذر إعادة الإرسال")}`}`);
}
