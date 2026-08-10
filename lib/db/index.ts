// طبقة الوصول للبيانات — واجهة موحدة مع تنفيذين: SQLite (محلي) + Supabase (إنتاج)
import type {
  AutomationRule, Attachment, Client, Condition, DevStatus, EmailLog, EmailTemplate,
  Job, Notification, Settings, Staff, Ticket, TicketEvent, Action, TemplateBlocks,
  RequestType, TicketKind, TicketPriority,
} from "../types";

export interface TicketFilter {
  involvesStaffId?: string; // يقصر النتائج على ما يخص هذا الموظف (منشئ/مطور/مختبِر/غير مُسنَد)
  q?: string;
  status?: DevStatus | "";
  developer_id?: string;
  tester_id?: string;
  request_type?: RequestType | "";
  ticket_kind?: TicketKind | "";
  source?: string;
  page?: number;
  pageSize?: number;
  staleOlderThanHours?: number; // للتذكيرات
}

export interface Repo {
  staffList(activeOnly?: boolean): Promise<Staff[]>;
  staffGet(id: string): Promise<Staff | null>;
  staffByEmail(email: string): Promise<Staff | null>;
  staffCreate(d: { name: string; email: string; role: Staff["role"]; manager_id: string | null }): Promise<Staff>;
  staffUpdate(id: string, patch: Partial<Staff>): Promise<void>;
  staffSetPin(id: string, pinHash: string): Promise<void>;

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
