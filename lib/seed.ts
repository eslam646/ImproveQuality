import type { AutomationRule, EmailTemplate, Staff, Ticket } from "./types";
import { DEFAULT_TEMPLATE_BLOCKS } from "./types";
import { nowIso } from "./util";

const t0 = Date.now();
const daysAgo = (d: number) => new Date(t0 - d * 86400000).toISOString();

export const SEED_STAFF: Staff[] = [
  { id: "st-admin", name: "أحمد المدير", email: "manager@example.com", role: "admin", manager_id: null, active: 1, created_at: nowIso() },
  { id: "st-sara", name: "سارة محمود", email: "sara@example.com", role: "support", manager_id: "st-admin", active: 1, created_at: nowIso() },
  { id: "st-ahmed", name: "أحمد سمير", email: "ahmed.dev@example.com", role: "developer", manager_id: "st-admin", active: 1, created_at: nowIso() },
  { id: "st-mona", name: "منى خالد", email: "mona.dev@example.com", role: "developer", manager_id: "st-admin", active: 1, created_at: nowIso() },
  { id: "st-karim", name: "كريم فؤاد", email: "karim.qa@example.com", role: "tester", manager_id: "st-admin", active: 1, created_at: nowIso() },
  { id: "st-laila", name: "ليلى حسن", email: "laila.qa@example.com", role: "tester", manager_id: "st-admin", active: 1, created_at: nowIso() },
];

export const SEED_TICKETS: Omit<Ticket, "seq">[] = [
  {
    id: "tk-1", code: "T-DEMO001", client_name: "شركة النور للتجارة", client_contact: "client1@example.com",
    details: "صفحة تسجيل الدخول لا تقبل كلمة المرور الصحيحة وتظهر خطأ 500.",
    created_by: "st-sara", created_by_name: "سارة محمود", developer_id: "st-ahmed", developer_name: "أحمد سمير",
    dev_status: "in_progress", source: "internal", last_status_change: daysAgo(1), created_at: daysAgo(2), updated_at: daysAgo(1),
  },
  {
    id: "tk-2", code: "T-DEMO002", client_name: "مؤسسة الأمل", client_contact: "",
    details: "طلب إضافة تقرير مبيعات شهري بصيغة Excel في لوحة التحكم.",
    created_by: "st-sara", created_by_name: "سارة محمود", developer_id: "st-mona", developer_name: "منى خالد",
    dev_status: "ready_for_test", source: "internal", last_status_change: daysAgo(0.5), created_at: daysAgo(4), updated_at: daysAgo(0.5),
  },
  {
    id: "tk-3", code: "T-DEMO003", client_name: "أحمد عبد الله", client_contact: "ahmed.abd@example.com",
    details: "التطبيق يتوقف عند فتح صفحة الفواتير على المتصفح فايرفوكس.",
    created_by: "st-sara", created_by_name: "سارة محمود", developer_id: null, developer_name: null,
    dev_status: "new", source: "web_guest", last_status_change: daysAgo(3), created_at: daysAgo(3), updated_at: daysAgo(3),
  },
  {
    id: "tk-4", code: "T-DEMO004", client_name: "شركة المستقبل", client_contact: "it@future.com",
    details: "تعديل لون الشعار في الترويسة حسب الهوية الجديدة.",
    created_by: "st-admin", created_by_name: "أحمد المدير", developer_id: "st-ahmed", developer_name: "أحمد سمير",
    dev_status: "fixed", source: "internal", last_status_change: daysAgo(6), created_at: daysAgo(9), updated_at: daysAgo(6),
  },
];

export const SEED_TEMPLATES: EmailTemplate[] = [
  {
    id: "tmpl-teams-manual-invite", name: "دعوة اجتماع Teams — رابط يدوي",
    subject: "📅 {{meeting_subject}} — {{ticket.code}}",
    body_html: `<p>تمت دعوتك لاجتماع Microsoft Teams مرتبط بالطلب.</p><p><b>الموعد:</b> {{meeting_start}}</p><p><b>المدة:</b> {{meeting_duration}}</p><p><a href="{{meeting_join_url}}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">الانضمام إلى اجتماع Teams ↗</a></p>`,
    blocks: { ...DEFAULT_TEMPLATE_BLOCKS, details: false, note: false, update_button: false },
    created_at: nowIso(), updated_at: nowIso(),
  },
  {
    id: "tmpl-urgent-progress", name: "تحديث موقف الدعم الفوري (مازلت أعمل / انتهيت)",
    subject: "{{progress_label}} — الدعم الفوري {{code}} بواسطة {{actor_name}}",
    body_html: `<b>{{actor_name}}</b> ({{actor_role}}) حدّث موقف الدعم الفوري الجانبي.<br><b>الموقف:</b> {{progress_label}}<br>{{note}}`,
    blocks: { ...DEFAULT_TEMPLATE_BLOCKS, status: true, note: false, update_button: false },
    created_at: nowIso(), updated_at: nowIso(),
  },
  {
    id: "tmpl-urgent-withdrawal", name: "اعتذار عن الدعم الفوري",
    subject: "🙅 اعتذار {{actor_role}} عن الدعم الفوري {{code}} — {{actor_name}}",
    body_html: `<b>{{actor_name}}</b> ({{actor_role}}) اعتذر عن الاستمرار في الدعم الفوري.<br><b>سبب الاعتذار:</b> {{reason}}<br>عادت المهمة لانتظار إعادة الإسناد.`,
    blocks: { ...DEFAULT_TEMPLATE_BLOCKS, status: true, note: false, update_button: false },
    created_at: nowIso(), updated_at: nowIso(),
  },
  {
    id: "tmpl-tester-assigned", name: "تكليف التيستر بطلب",
    subject: "🧪 أُسند إليك اختبار الطلب {{code}} — {{ticket.title}}",
    body_html: `مرحباً {{ticket.tester_name}}، تم إسناد الطلب التالي إليك للمراجعة والاختبار. وافق على التكليف أو ارفضه بسبب واضح من صفحة الطلب.`,
    blocks: { ...DEFAULT_TEMPLATE_BLOCKS, status: true, note: false, update_button: false },
    created_at: nowIso(), updated_at: nowIso(),
  },
  {
    id: "tmpl-created", name: "إشعار طلب جديد",
    subject: "طلب جديد {{code}} — {{client_name}}",
    body_html: `تم فتح طلب جديد 🆕 أدخله <b>{{created_by_name}}</b>.`,
    blocks: { ...DEFAULT_TEMPLATE_BLOCKS, status: false, note: false, update_button: false },
    created_at: nowIso(), updated_at: nowIso(),
  },
  {
    id: "tmpl-assigned", name: "تعيين مطور على تذكرة",
    subject: "أُسندت إليك التذكرة {{code}} — {{client_name}}",
    body_html: `مرحباً {{developer_name}} 👋 تم إسناد التذكرة التالية إليك. لتحديث حالة التطوير استخدم زر «تحديث حالة الطلب» بالأسفل.`,
    blocks: { ...DEFAULT_TEMPLATE_BLOCKS, note: false, track_button: false, update_button: true },
    created_at: nowIso(), updated_at: nowIso(),
  },
  {
    id: "tmpl-status", name: "تحديث حالة التطوير",
    subject: "تحديث حالة {{code}}: {{status_label}}",
    body_html: `تم تحديث حالة الطلب <b>{{code}}</b>.`,
    blocks: { ...DEFAULT_TEMPLATE_BLOCKS, details: false, note: true, update_button: false },
    created_at: nowIso(), updated_at: nowIso(),
  },
  {
    id: "tmpl-reminder", name: "تذكير بتذكرة متوقفة",
    subject: "⏰ تذكير: التذكرة {{code}} بلا تحديث منذ فترة",
    body_html: `التذكرة التالية لم تُحدَّث ضمن المهلة المحددة — برجاء المتابعة.`,
    blocks: { ...DEFAULT_TEMPLATE_BLOCKS, details: false, note: false, update_button: true },
    created_at: nowIso(), updated_at: nowIso(),
  },
];

export const SEED_RULES: AutomationRule[] = [
  {
    id: "rule-created", name: "طلب جديد → إبلاغ الإدارة والعميل", trigger_type: "ticket.created", trigger_field: null,
    conditions: [],
    actions: [
      { type: "send_email", to: [{ kind: "role", role: "admin" }, { kind: "ref", ref: "creator_manager" }], cc: [{ kind: "ref", ref: "client" }], template_id: "tmpl-created" },
      { type: "notify", to: [{ kind: "role", role: "admin" }], message: "طلب جديد {{code}} من {{client_name}}" },
    ],
    enabled: 1, run_count: 0, created_at: nowIso(),
  },
  {
    id: "rule-assigned", name: "تعيين مطور → إيميل للمطور وCC للمدخّل والمدير", trigger_type: "ticket.assigned", trigger_field: null,
    conditions: [],
    actions: [
      { type: "send_email", to: [{ kind: "ref", ref: "developer" }], cc: [{ kind: "ref", ref: "creator" }, { kind: "ref", ref: "developer_manager" }], template_id: "tmpl-assigned" },
      { type: "notify", to: [{ kind: "ref", ref: "developer" }], message: "أُسندت إليك التذكرة {{code}}" },
    ],
    enabled: 1, run_count: 0, created_at: nowIso(),
  },
  {
    id: "rule-status", name: "تغير حالة التطوير → إبلاغ المعنيين", trigger_type: "field.changed", trigger_field: "dev_status",
    // مرفوض/تم الإصلاح/مغلق لهم إيميلات مخصوصة (سبب/رافض/تسليم) — تتخطاهم هذه القاعدة منعاً للتكرار
    conditions: [{ field: "dev_status", op: "neq", value: "rejected" }, { field: "dev_status", op: "neq", value: "fixed" }, { field: "dev_status", op: "neq", value: "closed" }, { field: "dev_status", op: "neq", value: "test_failed" }],
    actions: [
      { type: "send_email", to: [{ kind: "ref", ref: "creator" }, { kind: "ref", ref: "developer" }], cc: [{ kind: "ref", ref: "creator_manager" }], template_id: "tmpl-status" },
    ],
    enabled: 1, run_count: 0, created_at: nowIso(),
  },
  {
    id: "rule-stale", name: "تذكير يومي بالتيكتات المتوقفة", trigger_type: "schedule.stale", trigger_field: null,
    conditions: [{ field: "dev_status", op: "in", value: "new,in_progress,ready_for_test,needs_info,test_failed" }],
    actions: [
      { type: "send_email", to: [{ kind: "ref", ref: "developer" }], cc: [{ kind: "ref", ref: "developer_manager" }, { kind: "role", role: "admin" }], template_id: "tmpl-reminder" },
    ],
    enabled: 1, run_count: 0, created_at: nowIso(),
  },
];
