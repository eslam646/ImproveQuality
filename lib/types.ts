// ====== الأنواع الأساسية للنظام ======

export type Role = "admin" | "support" | "developer" | "tester";

// ====== V2: تصنيف الطلب ودورة الإسناد ======
export type RequestType = "new_development" | "change_request" | "issue";
export type TicketKind = "standard" | "instant_support";
export type TicketPriority = "low" | "normal" | "high" | "critical";
export type AssignmentStatus = "unassigned" | "pending" | "accepted" | "declined" | "reassigned" | "completed";
export type OverallStatus =
  | "new" | "awaiting_tester" | "needs_info" | "awaiting_developer"
  | "in_development" | "hold" | "delivered_to_qc" | "testing"
  | "reopened" | "fixed" | "delivered" | "closed" | "rejected";

export type DevStatus =
  | "new"
  | "in_progress"
  | "ready_for_test"
  | "test_passed"
  | "test_failed"
  | "needs_info"
  | "fixed"
  | "closed"
  | "rejected";

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: Role;
  manager_id: string | null;
  active: number; // 1 | 0
  pin_hash?: string | null; // دخول الإنتاج AUTH_MODE=pin
  created_at: string;
}

export interface Ticket {
  id: string;
  seq: number;
  code: string;
  client_name: string;
  client_contact: string | null;
  title?: string | null;
  request_type?: RequestType;
  ticket_kind?: TicketKind;
  priority?: TicketPriority;
  overall_status?: OverallStatus;
  tester_assignment_status?: AssignmentStatus;
  developer_assignment_status?: AssignmentStatus;
  linked_ticket_id?: string | null;
  urgent_reason?: string | null;
  affected_service?: string | null;
  urgent_requested_at?: string | null;
  urgent_started_at?: string | null;
  urgent_ended_at?: string | null;
  urgent_result?: string | null;
  actual_minutes?: number | null;
  version?: number;
  details: string;
  created_by: string | null; // staff id (null للضيوف)
  created_by_name: string; // اسم المدخل كما ظهر وقت الإنشاء
  developer_id: string | null;
  developer_name: string | null; // denormalized للعرض السريع
  tester_id?: string | null;   // المختبِر المسند (يُحدد قبل المطور إجباراً)
  tester_name?: string | null;
  est_days?: number | null;    // تقدير التنفيذ: أيام
  est_hours?: number | null;   // تقدير التنفيذ: ساعات
  is_urgent?: boolean;         // تذكرة «دعم فوري»
  dev_status: DevStatus;
  source: "internal" | "web_guest" | "update_form";
  last_status_change: string;
  created_at: string;
  updated_at: string;
  custom_data?: Record<string, string> | null; // قيم الحقول المخصصة (يفعّلها الأدمن)
}

export type EventType =
  | "ticket.created"
  | "ticket.assigned"
  | "field.changed"
  | "note.added"
  | "attachment.added"
  | "job.executed";

export interface TicketEvent {
  id: number;
  ticket_id: string;
  type: EventType;
  actor_label: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

// ====== الأتمتة ======

export type TriggerType =
  | "ticket.created"
  | "ticket.assigned"
  | "field.changed"
  | "schedule.stale";

export interface Condition {
  field: string; // dev_status | source | developer_id ...
  op: "eq" | "neq" | "in";
  value: string; // في حالة in: قيم مفصولة بفواصل
}

export type Recipient =
  | { kind: "ref"; ref: "developer" | "creator" | "developer_manager" | "creator_manager" | "client" }
  | { kind: "staff"; staff_id: string }
  | { kind: "role"; role: Role }
  | { kind: "email"; email: string };

export type Action =
  | { type: "send_email"; to: Recipient[]; cc: Recipient[]; template_id: string }
  | { type: "notify"; to: Recipient[]; message: string }
  | { type: "update_field"; field: string; value: string };

export interface AutomationRule {
  id: string;
  name: string;
  trigger_type: TriggerType;
  trigger_field: string | null; // مع field.changed
  conditions: Condition[];
  actions: Action[];
  enabled: number; // 1 | 0
  run_count: number;
  created_at: string;
}

export type JobStatus = "queued" | "processing" | "done" | "failed" | "dead";

export interface Job {
  id: string;
  idempotency_key: string;
  type: "send_email" | "notify" | "update_field";
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_after: string;
  last_error: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string; // يدعم {{متغيرات}}
  body_html: string; // نص تمهيدي — يدعم {{متغيرات}}
  blocks: TemplateBlocks | null; // أقسام تلقائية قابلة للتفعيل — null = الافتراضي
  created_at: string;
  updated_at: string;
}

export interface EmailLog {
  id: string;
  job_id: string | null;
  ticket_id: string | null;
  to_addr: string;
  cc_addr: string | null;
  provider: string;
  provider_msg_id: string | null;
  subject: string;
  body_html: string;
  status: "sent" | "logged" | "delivered" | "failed" | "bounced";
  error: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  staff_id: string;
  ticket_id: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
}

export interface Attachment {
  id: string;
  ticket_id: string;
  file_name: string;
  size_bytes: number;
  path: string; // محلي: مسار النظام | supabase: رابط عام
  driver: "local" | "supabase";
  uploaded_by: string;
  created_at: string;
}

export interface Settings {
  app_name: string;
  allow_guest_submit: boolean;
  allow_track: boolean;          // صفحة الاستعلام العامة مفعّلة؟
  allow_public_update: boolean;  // نموذج تحديث الحالة بالكود مفعّل؟
  sender_name: string;
  sender_email: string;
  stale_hours: number;
  base_url: string;
  form_fields: FormFieldCfg[]; // مصمم النماذج: إظهار/إلزام كل حقل
  role_permissions: RolePermissions; // مصفوفة صلاحيات الأدوار
  custom_fields: CustomFieldCfg[];   // منشئ الحقول المخصصة
  track_cfg: TrackPageCfg;           // ماذا تعرض صفحة الاستعلام العامة
}

// مفاتيح حقول النماذج الخاضعة للتحكم (طلب داخلي + نموذج الضيوف)
export type FormFieldKey =
  | "client"          // اسم العميل (قائمة منسدلة + كتابة حرة)
  | "client_contact"  // وسيلة تواصل مدخل البيانات (ليس بريد العميل)
  | "request_type"    // جديد / تعديل / مشكلة
  | "title"           // عنوان مختصر وواضح
  | "details"         // تفاصيل وخطوات طويلة
  | "creator"         // مدخل البيانات
  | "tester"          // التيستر المسؤول
  | "developer"       // المطور (اختياري في الطلب العادي)
  | "attachment";     // مرفق الإنشاء

export interface FormFieldCfg {
  key: FormFieldKey;
  label: string;
  visible: boolean;
  required: boolean;
}

export const DEFAULT_FORM_FIELDS: FormFieldCfg[] = [
  { key: "client", label: "اسم العميل", visible: true, required: true },
  { key: "client_contact", label: "بريد مدخل البيانات", visible: false, required: false },
  { key: "request_type", label: "نوع الطلب", visible: true, required: true },
  { key: "title", label: "عنوان الطلب / المشكلة", visible: true, required: true },
  { key: "details", label: "التفاصيل والخطوات", visible: true, required: true },
  { key: "creator", label: "مدخل البيانات", visible: true, required: true },
  { key: "tester", label: "فريق الاختبار", visible: true, required: true },
  { key: "developer", label: "إسناد إلى مطور", visible: true, required: false },
  { key: "attachment", label: "المرفقات", visible: true, required: true },
];

// عميل في القائمة المنسدلة (بديل قوائم Lark)
export interface Client {
  id: string;
  name: string;
  contact_email: string | null;
  active: number; // 1|0
  created_at: string;
}

// أقسام قالب البريد القابلة للتفعيل/التعطيل من قبل الأدمن
export interface TemplateBlocks {
  status: boolean;         // شارة الحالة الحالية
  client: boolean;         // بيانات العميل
  developer: boolean;      // المطور المسند
  details: boolean;        // تفاصيل الطلب
  note: boolean;           // آخر ملاحظة/تعليق
  track_button: boolean;   // زر تتبع الطلب
  update_button: boolean;  // زر تحديث الحالة
}

export const DEFAULT_TEMPLATE_BLOCKS: TemplateBlocks = {
  status: true,
  client: true,
  developer: true,
  details: true,
  note: true,
  track_button: true,
  update_button: false,
};

// ===== مصفوفة الصلاحيات (يتحكم بها الأدمن من الإعدادات) =====
export type PermKey =
  | "dashboard" | "new_ticket" | "testing" | "automation"
  | "templates" | "staff" | "emails" | "settings" | "export_csv";

export const PERM_LABELS: Record<PermKey, string> = {
  dashboard: "لوحة التذاكر",
  new_ticket: "إنشاء طلب جديد",
  testing: "واجهة الاختبار",
  automation: "مركز الأتمتة",
  templates: "قوالب البريد",
  staff: "الموظفون والعملاء",
  emails: "سجل البريد",
  settings: "إعدادات النظام",
  export_csv: "تصدير CSV",
};

export type RolePermissions = Record<Role, Record<PermKey, boolean>>;

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  admin: { dashboard: true, new_ticket: true, testing: true, automation: true, templates: true, staff: true, emails: true, settings: true, export_csv: true },
  support: { dashboard: true, new_ticket: true, testing: false, automation: false, templates: false, staff: false, emails: false, settings: false, export_csv: true },
  developer: { dashboard: true, new_ticket: false, testing: false, automation: false, templates: false, staff: false, emails: false, settings: false, export_csv: false },
  tester: { dashboard: true, new_ticket: false, testing: true, automation: false, templates: false, staff: false, emails: false, settings: false, export_csv: false },
};

// ===== منشئ الحقول المخصصة =====
export type CustomFieldType = "text" | "textarea" | "number" | "select" | "date" | "file";

export interface CustomFieldCfg {
  key: string;          // مفتاح داخلي ثابت (يُولّد تلقائياً)
  label: string;        // الاسم الظاهر في النماذج
  type: CustomFieldType;
  options?: string[];   // لنوع select
  required: boolean;
  internal: boolean;    // يظهر في نموذج إنشاء الطلب الداخلي
  guest: boolean;       // يظهر في نموذج الضيوف العام
}

// ===== تحكم صفحة الاستعلام العامة =====
export interface TrackPageCfg {
  show_estimation: boolean;   // تقدير وقت التنفيذ (أيام/ساعات)
  show_timeline: boolean;     // مسار الحالة
  show_last_change: boolean;  // تاريخ آخر تحديث
  show_client: boolean;       // اسم العميل
  show_developer: boolean;    // اسم المطور المسند
  show_custom: boolean;       // الحقول المخصصة لمقدم الطلب
}

export const DEFAULT_TRACK_CFG: TrackPageCfg = {
  show_estimation: true,
  show_timeline: true,
  show_last_change: true,
  show_client: false,
  show_developer: false,
  show_custom: false,
};

export interface AutomationContext {
  ticket: Ticket;
  old?: Partial<Ticket> | null;
  actor_label: string;
}
