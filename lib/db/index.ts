// طبقة الوصول للبيانات — واجهة موحدة مع تنفيذين: SQLite (محلي) + Supabase (إنتاج)
import type {
  AutomationRule, Attachment, AuditEntry, Client, Condition, DevStatus, EmailLog, EmailTemplate,
  Job, Meeting, MeetingParticipant, Notification, PrivateAccessLink, Settings, Staff, Ticket, TicketAssignment, TicketSpecialist, TicketEvent, Action, TemplateBlocks,
  RequestType, TicketKind, TicketPriority,
} from "../types";

export interface TicketFilter {
  involvesStaffId?: string; // يقصر النتائج على ما يخص هذا الموظف (منشئ/مطور/مختبِر/غير مُسنَد)
  q?: string;
  status?: DevStatus | "";
  developer_id?: string;
  // «تذاكري كمطور»: مطور مباشر أو متخصص حالي (غير رافض) — تظهر فور الإسناد وتختفي عند رفضه
  assignedDevId?: string;
  tester_id?: string;
  created_by?: string;
  request_type?: RequestType | "";
  ticket_kind?: TicketKind | "";
  source?: string;
  page?: number;
  pageSize?: number;
  sort?: "created" | "updated"; // created = الأحدث إنشاءً (الافتراضي) | updated = الأحدث تعديلاً
  staleOlderThanHours?: number; // للتذكيرات
}

export interface Repo {
  staffList(activeOnly?: boolean): Promise<Staff[]>;
  staffGet(id: string): Promise<Staff | null>;
  staffByEmail(email: string): Promise<Staff | null>;
  staffCreate(d: { name: string; email: string; role: Staff["role"]; manager_id: string | null; specializations?: string[] | null }): Promise<Staff>;
  staffUpdate(id: string, patch: Partial<Staff>): Promise<void>;
  staffSetPin(id: string, pinHash: string): Promise<void>;

  privateLinkCreate(input: { staff_id: string; token_hash: string; kind?: "request" | "login"; label?: string | null; created_by?: string | null }): Promise<PrivateAccessLink>;
  privateLinkByHash(tokenHash: string): Promise<PrivateAccessLink | null>;
  privateLinkGet(id: string): Promise<PrivateAccessLink | null>;
  privateLinksList(staffId?: string): Promise<PrivateAccessLink[]>;
  privateLinkTouch(id: string): Promise<void>;
  privateLinkRevoke(id: string): Promise<void>;

  settingsGet(): Promise<Settings>;
  settingsSet(patch: Partial<Settings>): Promise<void>;
  settingsValueGet(key: string): Promise<string | null>; // مفتاح/قيمة عام (جلسة العرض التجريبي…)
  settingsValueSet(key: string, value: string): Promise<void>;

  clientsList(activeOnly?: boolean): Promise<Client[]>;
  clientSave(c: { id?: string; name: string; contact_email?: string | null }): Promise<Client>;
  clientSetActive(id: string, active: number): Promise<void>;
  clientDelete(id: string): Promise<void>;

  ticketCreate(input: {
    client_name: string; client_contact: string | null; title?: string | null; details: string;
    request_type?: RequestType; ticket_kind?: TicketKind; priority?: TicketPriority;
    linked_ticket_id?: string | null; urgent_reason?: string | null; affected_service?: string | null;
    created_by: string | null; created_by_name: string;
    developer_id: string | null; developer_name: string | null;
    source: Ticket["source"]; code: string;
    custom_data?: Record<string, string> | null;
    tester_id?: string | null; tester_name?: string | null; is_urgent?: boolean;
  }): Promise<Ticket>;
  ticketByCode(code: string): Promise<Ticket | null>;
  ticketById(id: string): Promise<Ticket | null>;
  ticketList(f: TicketFilter): Promise<{ rows: Ticket[]; total: number }>;
  ticketUpdate(id: string, patch: Partial<Ticket>): Promise<Ticket | null>;
  ticketCounts(): Promise<{ total: number; byStatus: Record<string, number> }>;

  assignmentCreate(a: {
    ticket_id: string; assignment_role: "tester" | "developer"; staff_id: string; assigned_by: string | null;
  }): Promise<TicketAssignment>;
  assignmentCurrent(ticketId: string, role: "tester" | "developer"): Promise<TicketAssignment | null>;
  assignmentRespond(id: string, status: "accepted" | "declined", reason?: string | null): Promise<TicketAssignment | null>;
  assignmentComplete(ticketId: string, role: "tester" | "developer"): Promise<void>;
  assignmentList(ticketId: string): Promise<TicketAssignment[]>;

  // متخصصو التطوير (باك/فرونت/UX) — لكل تخصص شخص وتقدير وحالة مستقلة
  specialistAdd(sp: {
    ticket_id: string; spec_key: string; spec_label: string; staff_id: string; staff_name: string;
    est_days?: number | null; est_hours?: number | null; assigned_by?: string | null;
  }): Promise<TicketSpecialist>;
  specialistList(ticketId: string): Promise<TicketSpecialist[]>;
  // تكليفات التخصص المعلقة بانتظار قرار موظف معيّن — لبانر «بانتظار قرارك»
  specialistsPendingFor(staffId: string): Promise<TicketSpecialist[]>;
  specialistGet(id: string): Promise<TicketSpecialist | null>;
  specialistUpdate(id: string, patch: Partial<TicketSpecialist>): Promise<TicketSpecialist | null>;
  specialistRemove(id: string): Promise<void>;

  meetingCreate(m: Omit<Meeting, "id" | "created_at" | "updated_at">): Promise<Meeting>;
  meetingList(ticketId: string): Promise<Meeting[]>;
  meetingGet(id: string): Promise<Meeting | null>;
  meetingUpdate(id: string, patch: Partial<Meeting>): Promise<Meeting | null>;
  meetingParticipantsAdd(items: Omit<MeetingParticipant, "id">[]): Promise<void>;
  meetingParticipantsList(meetingId: string): Promise<MeetingParticipant[]>;

  auditAdd(e: {
    entity_type: string; entity_id: string; action: string; actor_staff_id?: string | null; actor_label?: string | null;
    old_values?: Record<string, unknown> | null; new_values?: Record<string, unknown> | null;
    request_ip?: string | null; user_agent?: string | null;
  }): Promise<AuditEntry>;
  auditList(entityType: string, entityId: string): Promise<AuditEntry[]>;

  eventAdd(e: Omit<TicketEvent, "id" | "created_at">): Promise<TicketEvent>;
  eventList(ticketId: string): Promise<TicketEvent[]>;

  rulesList(): Promise<AutomationRule[]>;
  rulesEnabled(): Promise<AutomationRule[]>;
  ruleUpsert(r: {
    id?: string; name: string; trigger_type: AutomationRule["trigger_type"];
    trigger_field: string | null; conditions: Condition[]; actions: Action[]; enabled: number;
  }): Promise<AutomationRule>;
  ruleDelete(id: string): Promise<void>;
  ruleBump(id: string): Promise<void>;

  jobEnqueue(j: {
    idempotency_key: string; type: Job["type"]; payload: Record<string, unknown>; delaySeconds?: number;
  }): Promise<"created" | "dup">;
  jobsDue(limit: number): Promise<Job[]>;
  jobsRecent(limit: number): Promise<Job[]>;
  // استعادة العالق: processing قديمة (ماتت عمليتها) تعود queued — وتُرجع عدد المُستعاد
  jobsRecoverStuck(olderThanMinutes: number): Promise<number>;
  // إجبار المؤجل: كل queued مؤجلة (backoff) تصبح مستحقة الآن — للزر اليدوي
  jobsForceDue(): Promise<number>;
  // إعادة مهمة واحدة للطابور مستحقة الآن (لإرسال فردي مهما كانت حالتها)
  jobRequeue(id: string): Promise<void>;
  jobGet(id: string): Promise<Job | null>;
  jobClaim(id: string): Promise<boolean>;
  jobDone(id: string): Promise<void>;
  jobFail(id: string, err: string, retryAtIso: string | null): Promise<void>;

  templateList(): Promise<EmailTemplate[]>;
  templateGet(id: string): Promise<EmailTemplate | null>;
  templateUpsert(t: { id?: string; name: string; subject: string; body_html: string; blocks?: TemplateBlocks | null }): Promise<EmailTemplate>;
  templateDelete(id: string): Promise<void>;

  emailLogAdd(e: Omit<EmailLog, "id" | "created_at"> & { id?: string }): Promise<EmailLog>;
  emailLogSetProvider(id: string, provider: string, msgId: string | null, status: EmailLog["status"], error?: string | null): Promise<void>;
  emailLogSetStatusByMsg(msgId: string, status: EmailLog["status"], error?: string | null): Promise<void>;
  emailLogList(page?: number, pageSize?: number, ticketId?: string): Promise<{ rows: EmailLog[]; total: number }>;

  notifyAdd(n: { staff_id: string; ticket_id: string | null; message: string }): Promise<void>;
  notificationsList(staffId: string): Promise<Notification[]>;
  notificationsUnread(staffId: string): Promise<number>;
  notificationsMarkRead(staffId: string): Promise<void>;

  attachmentAdd(a: Omit<Attachment, "created_at">): Promise<Attachment>;
  attachmentList(ticketId: string): Promise<Attachment[]>;
  attachmentGet(id: string): Promise<Attachment | null>;
}

let cached: Repo | null = null;

export async function getRepo(): Promise<Repo> {
  if (cached) return cached;
  if (process.env.DB_DRIVER === "supabase") {
    const mod = await import("./supabase");
    cached = await mod.createSupabaseRepo();
  } else {
    const mod = await import("./sqlite");
    cached = mod.createSqliteRepo();
  }
  return cached;
}
