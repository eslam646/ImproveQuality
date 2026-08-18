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

export interface TicketAssignment {
  id: string;
  ticket_id: string;
  assignment_role: "tester" | "developer";
  staff_id: string;
  status: "pending" | "accepted" | "declined" | "reassigned" | "completed" | "cancelled";
  decline_reason: string | null;
  assigned_by: string | null;
  assigned_at: string;
  responded_at: string | null;
  completed_at: string | null;
  is_current: boolean;
}

export interface Meeting {
  id: string;
  ticket_id: string | null;
  provider: "teams";
  provider_meeting_id: string | null;
  subject: string;
  starts_at: string;
  ends_at: string;
  join_url: string | null;
  organizer_staff_id: string | null;
  status: "scheduled" | "started" | "ended" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  staff_id: string | null;
  email: string | null;
  response_status: string;
  joined_at: string | null;
  left_at: string | null;
}

export interface PrivateAccessLink {
  id: string;
  staff_id: string;
  token_hash: string;
  label: string | null;
  active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface AuditEntry {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_staff_id: string | null;
  actor_label: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  request_ip: string | null;
  user_agent: string | null;
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
  | { kind: "ref"; ref:
      | "developer" | "tester" | "creator"
      | "developer_manager" | "tester_manager" | "creator_manager"
      | "ticket_parties" | "ticket_managers" | "client" }
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
  form_fields: FormFieldCfg[]; // نموذج الطلب العادي/العام — ترتيب المصفوفة هو ترتيب العرض
  urgent_form_fields: UrgentFormFieldCfg[]; // نموذج الدعم الفوري — إظهار/إلزام/ترتيب
  role_permissions: RolePermissions; // مصفوفة صلاحيات الأدوار
  user_permissions: UserPermissionOverrides; // استثناءات فردية: true سماح / false منع / غير موجود يرث الدور
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

export type UrgentFormFieldKey = "client" | "creator" | "title" | "affected_service" | "details" | "tester" | "developer";
export interface UrgentFormFieldCfg {
  key: UrgentFormFieldKey;
  label: string;
  visible: boolean;
  required: boolean;
  locked?: boolean; // حقول جوهرية لدورة العمل لا يمكن إخفاؤها
}
export const DEFAULT_URGENT_FORM_FIELDS: UrgentFormFieldCfg[] = [
  { key: "client", label: "العميل", visible: true, required: true, locked: true },
  { key: "creator", label: "مدخل البيانات (مقدم الطلب)", visible: true, required: true, locked: true },
  { key: "title", label: "عنوان المشكلة الطارئة", visible: true, required: true, locked: true },
  { key: "affected_service", label: "السيرفر / قاعدة البيانات / الخدمة المتأثرة", visible: true, required: true },
  { key: "details", label: "تفاصيل المشكلة الطارئة", visible: true, required: true, locked: true },
  { key: "tester", label: "مسؤول الاختبار", visible: true, required: true, locked: true },
  { key: "developer", label: "المطور", visible: true, required: true, locked: true },
];

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
export type TemplateBlockKey = "status" | "client" | "title" | "request_type" | "priority" | "creator" | "tester" | "developer" | "estimation" | "affected_service" | "details" | "note" | "track_button" | "update_button";

export interface TemplateBlocks {
  order?: TemplateBlockKey[];
  status: boolean;           // شارة الحالة الحالية
  client: boolean;           // اسم العميل
  title: boolean;            // عنوان الطلب
  request_type: boolean;     // نوع الطلب
  priority: boolean;         // الأولوية / دعم فوري
  creator: boolean;          // مدخل البيانات
  tester: boolean;           // التيستر المسند
  developer: boolean;        // المطور المسند
  estimation: boolean;       // التقدير الزمني
  affected_service: boolean; // الخدمة المتأثرة في الدعم الفوري
  details: boolean;          // تفاصيل الطلب
  note: boolean;             // آخر ملاحظة/تعليق
  track_button: boolean;     // زر عرض الطلب
  update_button: boolean;    // زر تحديث الحالة
}

export const DEFAULT_TEMPLATE_BLOCKS: TemplateBlocks = {
  order: ["status", "client", "title", "request_type", "priority", "creator", "tester", "developer", "estimation", "affected_service", "details", "note", "track_button", "update_button"],
  status: true,
  client: true,
  title: true,
  request_type: true,
  priority: true,
  creator: true,
  tester: true,
  developer: true,
  estimation: true,
  affected_service: true,
  details: true,
  note: true,
  track_button: true,
  update_button: false,
};

// ===== مصفوفة الصلاحيات (يتحكم بها الأدمن من الإعدادات) =====
export type PermKey =
  // الصفحات
  | "dashboard" | "new_ticket" | "testing" | "automation" | "templates" | "staff" | "emails" | "settings" | "export_csv"
  // نطاق الرؤية
  | "view_all_tickets" | "view_own_created" | "view_assigned_tickets" | "view_audit"
  // إجراءات التذكرة
  | "create_standard_ticket" | "create_instant_support" | "edit_ticket_fields" | "assign_tester" | "assign_developer"
  | "set_estimation" | "change_status" | "add_note" | "upload_attachment" | "assignment_decision" | "update_urgent_progress"
  // إدارة وتشغيل
  | "manage_private_links" | "resend_email" | "manage_meetings" | "join_meetings";

export const PERM_LABELS: Record<PermKey, string> = {
  dashboard: "صفحة: لوحة التذاكر", new_ticket: "صفحة: إنشاء طلب", testing: "صفحة: واجهة الاختبار",
  automation: "صفحة: الأتمتة", templates: "صفحة: قوالب البريد", staff: "صفحة: الموظفون والعملاء",
  emails: "صفحة: سجل البريد", settings: "صفحة: الإعدادات", export_csv: "تصدير CSV",
  view_all_tickets: "رؤية كل التذاكر", view_own_created: "رؤية الطلبات التي أنشأها", view_assigned_tickets: "رؤية التذاكر المسندة إليه", view_audit: "رؤية سجل التدقيق",
  create_standard_ticket: "إنشاء طلب عادي", create_instant_support: "إنشاء دعم فوري", edit_ticket_fields: "تعديل بيانات الطلب",
  assign_tester: "إسناد / تغيير التيستر", assign_developer: "إسناد / تغيير المطور", set_estimation: "تعديل التقدير",
  change_status: "تغيير الحالة المسموحة للدور", add_note: "إضافة ملاحظات", upload_attachment: "رفع مرفقات بعد الإنشاء",
  assignment_decision: "قبول / رفض التكليف", update_urgent_progress: "تحديث تقدم الدعم الفوري (مازلت أعمل / انتهيت)",
  manage_private_links: "إدارة الروابط الخاصة", resend_email: "إعادة إرسال البريد",
  manage_meetings: "إنشاء / إلغاء اجتماعات Teams", join_meetings: "رؤية رابط الاجتماع والانضمام",
};

export type RolePermissions = Record<Role, Record<PermKey, boolean>>;
export type UserPermissionOverrides = Record<string, Partial<Record<PermKey, boolean>>>;

const ADMIN_PERMISSIONS = Object.fromEntries((Object.keys(PERM_LABELS) as PermKey[]).map((k) => [k, true])) as Record<PermKey, boolean>;
export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  admin: ADMIN_PERMISSIONS,
  support: {
    dashboard: true, new_ticket: true, testing: false, automation: false, templates: false, staff: false, emails: false, settings: false, export_csv: true,
    view_all_tickets: false, view_own_created: true, view_assigned_tickets: false, view_audit: false,
    create_standard_ticket: true, create_instant_support: true, edit_ticket_fields: false, assign_tester: false, assign_developer: false,
    set_estimation: false, change_status: false, add_note: true, upload_attachment: false, assignment_decision: false, update_urgent_progress: false,
    manage_private_links: false, resend_email: false, manage_meetings: false, join_meetings: true,
  },
  developer: {
    dashboard: true, new_ticket: false, testing: false, automation: false, templates: false, staff: false, emails: false, settings: false, export_csv: false,
    view_all_tickets: false, view_own_created: false, view_assigned_tickets: true, view_audit: false,
    create_standard_ticket: false, create_instant_support: false, edit_ticket_fields: false, assign_tester: false, assign_developer: false,
    set_estimation: false, change_status: true, add_note: true, upload_attachment: true, assignment_decision: true, update_urgent_progress: true,
    manage_private_links: false, resend_email: false, manage_meetings: false, join_meetings: true,
  },
  tester: {
    dashboard: true, new_ticket: false, testing: true, automation: false, templates: false, staff: false, emails: false, settings: false, export_csv: false,
    view_all_tickets: false, view_own_created: false, view_assigned_tickets: true, view_audit: false,
    create_standard_ticket: false, create_instant_support: false, edit_ticket_fields: false, assign_tester: false, assign_developer: true,
    set_estimation: false, change_status: true, add_note: true, upload_attachment: true, assignment_decision: true, update_urgent_progress: true,
    manage_private_links: false, resend_email: false, manage_meetings: false, join_meetings: true,
  },
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
export type TrackPageFieldKey =
  | "show_estimation" | "show_timeline" | "show_last_change" | "show_client" | "show_title"
  | "show_request_type" | "show_ticket_kind" | "show_priority" | "show_creator" | "show_tester"
  | "show_developer" | "show_assignment_status" | "show_affected_service" | "show_custom";

export interface TrackPageCfg {
  order?: TrackPageFieldKey[];
  show_estimation: boolean;
  show_timeline: boolean;
  show_last_change: boolean;
  show_client: boolean;
  show_title: boolean;
  show_request_type: boolean;
  show_ticket_kind: boolean;
  show_priority: boolean;
  show_creator: boolean;
  show_tester: boolean;
  show_developer: boolean;
  show_assignment_status: boolean;
  show_affected_service: boolean;
  show_custom: boolean;
}

export const DEFAULT_TRACK_CFG: TrackPageCfg = {
  order: ["show_title", "show_ticket_kind", "show_request_type", "show_client", "show_creator", "show_tester", "show_developer", "show_assignment_status", "show_priority", "show_affected_service", "show_estimation", "show_last_change", "show_timeline", "show_custom"],
  show_estimation: true,
  show_timeline: true,
  show_last_change: true,
  show_client: false,
  show_title: true,
  show_request_type: true,
  show_ticket_kind: true,
  show_priority: false,
  show_creator: false,
  show_tester: false,
  show_developer: false,
  show_assignment_status: false,
  show_affected_service: false,
  show_custom: false,
};

export interface AutomationContext {
  ticket: Ticket;
  old?: Partial<Ticket> | null;
  actor_label: string;
}
