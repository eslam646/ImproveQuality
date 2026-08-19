import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type { Repo, TicketFilter } from "./index";
import type {
  AuditEntry, AutomationRule, Attachment, Client, CustomFieldCfg, EmailLog, EmailTemplate, FormFieldCfg, Job, Meeting, MeetingParticipant, Notification,
  EstimationReminderCfg, PermKey, PrivateAccessLink, Role, RolePermissions, Settings, Staff, Ticket, TicketAssignment, TicketEvent, TrackPageCfg, UrgentFormFieldCfg, UserPermissionOverrides,
} from "../types";
import { DEFAULT_FORM_FIELDS, DEFAULT_ROLE_PERMISSIONS, DEFAULT_TRACK_CFG,
  DEFAULT_ESTIMATION_REMINDERS, DEFAULT_URGENT_FORM_FIELDS } from "../types";
import { SEED_RULES, SEED_STAFF, SEED_TEMPLATES, SEED_TICKETS } from "../seed";
import { genId, genTicketCode, nowIso } from "../util";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "support.db");

export function createSqliteRepo(): Repo {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
  CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL,
    manager_id TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tickets (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
    code TEXT UNIQUE NOT NULL, client_name TEXT NOT NULL, client_contact TEXT,
    details TEXT NOT NULL, created_by TEXT, created_by_name TEXT NOT NULL,
    developer_id TEXT, developer_name TEXT,
    dev_status TEXT NOT NULL DEFAULT 'new', source TEXT NOT NULL DEFAULT 'internal',
    last_status_change TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    custom_data TEXT NOT NULL DEFAULT '{}',
    tester_id TEXT, tester_name TEXT, est_hours REAL, est_days REAL, is_urgent INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(dev_status);
  CREATE INDEX IF NOT EXISTS idx_tickets_dev ON tickets(developer_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_stale ON tickets(dev_status, last_status_change);
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL, type TEXT NOT NULL,
    actor_label TEXT NOT NULL, old_values TEXT, new_values TEXT, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_ticket ON events(ticket_id);
  CREATE TABLE IF NOT EXISTS automation_rules (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, trigger_type TEXT NOT NULL, trigger_field TEXT,
    conditions TEXT NOT NULL DEFAULT '[]', actions TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1, run_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, idempotency_key TEXT UNIQUE NOT NULL, type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 5,
    run_after TEXT NOT NULL, last_error TEXT, created_at TEXT NOT NULL, processed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_pick ON jobs(status, run_after);
  CREATE TABLE IF NOT EXISTS email_templates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, subject TEXT NOT NULL, body_html TEXT NOT NULL,
    blocks TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, contact_email TEXT,
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS email_log (
    id TEXT PRIMARY KEY, job_id TEXT, ticket_id TEXT, to_addr TEXT NOT NULL, cc_addr TEXT,
    provider TEXT NOT NULL, provider_msg_id TEXT, subject TEXT NOT NULL, body_html TEXT NOT NULL,
    status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, ticket_id TEXT, message TEXT NOT NULL,
    read_at TEXT, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notif_staff ON notifications(staff_id, read_at);
  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, file_name TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0, path TEXT NOT NULL, driver TEXT NOT NULL DEFAULT 'local',
    uploaded_by TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS private_access_links (
    id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, label TEXT,
    active INTEGER NOT NULL DEFAULT 1, expires_at TEXT, last_used_at TEXT, created_by TEXT,
    created_at TEXT NOT NULL, revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_private_links_staff ON private_access_links(staff_id, active);
  CREATE TABLE IF NOT EXISTS ticket_assignments (
    id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, assignment_role TEXT NOT NULL, staff_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', decline_reason TEXT, assigned_by TEXT, assigned_at TEXT NOT NULL,
    responded_at TEXT, completed_at TEXT, is_current INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_assignments_ticket ON ticket_assignments(ticket_id, assignment_role, is_current);
  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY, ticket_id TEXT, provider TEXT NOT NULL DEFAULT 'teams', provider_meeting_id TEXT,
    subject TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, join_url TEXT,
    organizer_staff_id TEXT, status TEXT NOT NULL DEFAULT 'scheduled', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meeting_participants (
    id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, staff_id TEXT, email TEXT, response_status TEXT NOT NULL DEFAULT 'pending', joined_at TEXT, left_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_meetings_ticket ON meetings(ticket_id, starts_at);
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
    actor_staff_id TEXT, actor_label TEXT, old_values TEXT, new_values TEXT, request_ip TEXT, user_agent TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id, created_at);
  `);

  // ترحيلات لطيفة لقواعد موجودة مسبقاً
  try { db.exec("ALTER TABLE email_templates ADD COLUMN blocks TEXT"); } catch { /* العمود موجود */ }
  try { db.exec("ALTER TABLE staff ADD COLUMN pin_hash TEXT"); } catch { /* العمود موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN custom_data TEXT NOT NULL DEFAULT '{}'"); } catch { /* العمود موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN tester_id TEXT"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN tester_name TEXT"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN est_hours REAL"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN est_days REAL"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN dev_est_days REAL"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN dev_est_hours REAL"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN test_est_days REAL"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN test_est_hours REAL"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN dev_started_at TEXT"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN test_started_at TEXT"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN reminders_sent TEXT"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN is_urgent INTEGER NOT NULL DEFAULT 0"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN title TEXT"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN request_type TEXT NOT NULL DEFAULT 'issue'"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN ticket_kind TEXT NOT NULL DEFAULT 'standard'"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN overall_status TEXT NOT NULL DEFAULT 'new'"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN tester_assignment_status TEXT NOT NULL DEFAULT 'unassigned'"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN developer_assignment_status TEXT NOT NULL DEFAULT 'unassigned'"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN linked_ticket_id TEXT"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN urgent_reason TEXT"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN affected_service TEXT"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN urgent_requested_at TEXT"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN urgent_started_at TEXT"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN urgent_ended_at TEXT"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN urgent_result TEXT"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN actual_minutes INTEGER"); } catch { /* موجود */ }
  try { db.exec("ALTER TABLE tickets ADD COLUMN version INTEGER NOT NULL DEFAULT 1"); } catch { /* موجود */ }

  // بذر العملاء مستقل عن بذر الموظفين (يعمل حتى على القواعد القديمة)
  const clientCount = db.prepare("SELECT COUNT(*) c FROM clients").get() as { c: number };
  if (clientCount.c === 0) {
    const ins = db.prepare("INSERT INTO clients (id,name,contact_email,active,created_at) VALUES (?,?,?,1,?)");
    const now = nowIso();
    [
      ["cl-nour", "شركة النور للتجارة", "client1@example.com"],
      ["cl-amal", "مؤسسة الأمل", "client2@example.com"],
      ["cl-future", "شركة المستقبل للتقنية", "client3@example.com"],
      ["cl-reem", "استوديو ريم للتصميم", "client4@example.com"],
    ].forEach(([id, name, email]) => ins.run(id, name, email, now));
  }

  // البذر الأول
  const staffCount = db.prepare("SELECT COUNT(*) c FROM staff").get() as { c: number };
  if (staffCount.c === 0) {
    const seedAll = db.transaction(() => {
      const insStaff = db.prepare("INSERT INTO staff (id,name,email,role,manager_id,active,created_at) VALUES (?,?,?,?,?,?,?)");
      SEED_STAFF.forEach((s) => insStaff.run(s.id, s.name, s.email, s.role, s.manager_id, s.active, s.created_at));
      const insTicket = db.prepare(`INSERT INTO tickets (id,code,client_name,client_contact,details,created_by,created_by_name,developer_id,developer_name,dev_status,source,last_status_change,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      SEED_TICKETS.forEach((t) => insTicket.run(t.id, t.code, t.client_name, t.client_contact, t.details, t.created_by, t.created_by_name, t.developer_id, t.developer_name, t.dev_status, t.source, t.last_status_change, t.created_at, t.updated_at));
      const insTmpl = db.prepare("INSERT INTO email_templates (id,name,subject,body_html,created_at,updated_at) VALUES (?,?,?,?,?,?)");
      SEED_TEMPLATES.forEach((t) => insTmpl.run(t.id, t.name, t.subject, t.body_html, t.created_at, t.updated_at));
      const insRule = db.prepare("INSERT INTO automation_rules (id,name,trigger_type,trigger_field,conditions,actions,enabled,run_count,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
      SEED_RULES.forEach((r) => insRule.run(r.id, r.name, r.trigger_type, r.trigger_field, JSON.stringify(r.conditions), JSON.stringify(r.actions), r.enabled, r.run_count, r.created_at));
      const insSet = db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)");
      insSet.run("app_name", "بوابة الدعم الفني");
      insSet.run("allow_guest_submit", "1");
      insSet.run("sender_name", process.env.EMAIL_FROM_NAME || "الدعم الفني");
      insSet.run("sender_email", process.env.EMAIL_FROM_ADDRESS || "");
      insSet.run("stale_hours", process.env.STALE_HOURS || "24");
      insSet.run("base_url", process.env.APP_BASE_URL || "http://localhost:3000");
    });
    seedAll();
  }
  // أي قالب افتراضي جديد يُضاف مرة واحدة فقط؛ القوالب المعدلة لا يتم استبدالها
  const ensureTemplate = db.prepare("INSERT OR IGNORE INTO email_templates (id,name,subject,body_html,blocks,created_at,updated_at) VALUES (?,?,?,?,?,?,?)");
  SEED_TEMPLATES.forEach((t) => ensureTemplate.run(t.id, t.name, t.subject, t.body_html, t.blocks ? JSON.stringify(t.blocks) : null, t.created_at, t.updated_at));
  // القواعد الافتراضية الجديدة تُضاف للقواعد الموجودة دون المساس بتعديلات الأدمن
  const ensureRule = db.prepare("INSERT OR IGNORE INTO automation_rules (id,name,trigger_type,trigger_field,conditions,actions,enabled,run_count,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
  SEED_RULES.forEach((r) => ensureRule.run(r.id, r.name, r.trigger_type, r.trigger_field, JSON.stringify(r.conditions), JSON.stringify(r.actions), r.enabled, r.run_count, r.created_at));

  const mapTemplate = (r: Omit<EmailTemplate, "blocks"> & { blocks: string | null }): EmailTemplate => ({
    ...r,
    blocks: r.blocks ? (JSON.parse(r.blocks) as EmailTemplate["blocks"]) : null,
  });

  const mapRule = (r: Record<string, unknown>): AutomationRule => ({
    ...(r as unknown as AutomationRule),
    conditions: JSON.parse((r.conditions as string) || "[]"),
    actions: JSON.parse((r.actions as string) || "[]"),
  });
  const mapJob = (r: Record<string, unknown>): Job => ({
    ...(r as unknown as Job),
    payload: JSON.parse((r.payload as string) || "{}"),
  });

  type TicketRow = Omit<Ticket, "custom_data"> & { custom_data: string | null };
  const mapTicket = (r: TicketRow): Ticket => {
    let custom_data: Record<string, string> = {};
    try { custom_data = r.custom_data ? (JSON.parse(r.custom_data) as Record<string, string>) : {}; } catch { /* فارغ */ }
    let reminders_sent: Record<string, string> | null = null;
    const raw = (r as unknown as { reminders_sent?: string | null }).reminders_sent;
    try { reminders_sent = raw ? (JSON.parse(raw) as Record<string, string>) : null; } catch { /* فارغ */ }
    return { ...(r as unknown as Ticket), custom_data, reminders_sent };
  };

  const settingsGet: Repo["settingsGet"] = async () => {
    const rows = db.prepare("SELECT key,value FROM settings").all() as { key: string; value: string }[];
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    // مصمم النماذج: دمج المحفوظ فوق الافتراضي (حقول جديدة تظهر تلقائياً)
    let form_fields: FormFieldCfg[] = DEFAULT_FORM_FIELDS;
    if (m.form_fields) {
      try {
        const saved = JSON.parse(m.form_fields) as FormFieldCfg[];
        const known = saved.filter((s) => DEFAULT_FORM_FIELDS.some((d) => d.key === s.key))
          .map((s) => ({ ...DEFAULT_FORM_FIELDS.find((d) => d.key === s.key)!, ...s }));
        form_fields = [...known, ...DEFAULT_FORM_FIELDS.filter((d) => !known.some((s) => s.key === d.key))];
      } catch { /* الافتراضي */ }
    }
    let urgent_form_fields: UrgentFormFieldCfg[] = DEFAULT_URGENT_FORM_FIELDS;
    if (m.urgent_form_fields) {
      try {
        const saved = JSON.parse(m.urgent_form_fields) as UrgentFormFieldCfg[];
        // «القفل» قرار نظام يأتي من الكود دائماً — المحفوظ يتحكم في الظاهر/الإجباري/الترتيب فقط
        const known = saved.filter((s) => DEFAULT_URGENT_FORM_FIELDS.some((d) => d.key === s.key))
          .map((s) => { const d = DEFAULT_URGENT_FORM_FIELDS.find((x) => x.key === s.key)!; return { ...d, ...s, locked: d.locked, label: d.label }; });
        urgent_form_fields = [...known, ...DEFAULT_URGENT_FORM_FIELDS.filter((d) => !known.some((s) => s.key === d.key))];
      } catch { /* الافتراضي */ }
    }
    // مصفوفة الصلاحيات: دمج المحفوظ فوق الافتراضي
    let role_permissions: RolePermissions = DEFAULT_ROLE_PERMISSIONS;
    if (m.role_permissions) {
      try {
        const saved = JSON.parse(m.role_permissions) as Partial<Record<Role, Partial<Record<PermKey, boolean>>>>;
        role_permissions = (Object.keys(DEFAULT_ROLE_PERMISSIONS) as Role[]).reduce((acc, role) => {
          acc[role] = { ...DEFAULT_ROLE_PERMISSIONS[role], ...(saved[role] ?? {}) };
          return acc;
        }, {} as RolePermissions);
      } catch { /* الافتراضي */ }
    }
    let user_permissions: UserPermissionOverrides = {};
    if (m.user_permissions) {
      try { user_permissions = JSON.parse(m.user_permissions) as UserPermissionOverrides; } catch { /* فارغ */ }
    }
    // منشئ الحقول المخصصة
    let custom_fields: CustomFieldCfg[] = [];
    if (m.custom_fields) {
      try {
        const saved = JSON.parse(m.custom_fields) as CustomFieldCfg[];
        if (Array.isArray(saved)) custom_fields = saved.filter((f) => f && typeof f.key === "string" && typeof f.label === "string");
      } catch { /* الافتراضي */ }
    }
    // تحكم صفحة الاستعلام
    let track_cfg: TrackPageCfg = DEFAULT_TRACK_CFG;
    if (m.track_cfg) {
      try { track_cfg = { ...DEFAULT_TRACK_CFG, ...(JSON.parse(m.track_cfg) as Partial<TrackPageCfg>) }; } catch { /* الافتراضي */ }
    }
    // تذكيرات التقدير الزمني — قابلة للتحكم بالكامل من الإعدادات
    let estimation_reminders: EstimationReminderCfg = DEFAULT_ESTIMATION_REMINDERS;
    if (m.estimation_reminders) {
      try { estimation_reminders = { ...DEFAULT_ESTIMATION_REMINDERS, ...(JSON.parse(m.estimation_reminders) as Partial<EstimationReminderCfg>) }; } catch { /* الافتراضي */ }
    }
    return {
      app_name: m.app_name ?? "بوابة الدعم الفني",
      allow_guest_submit: (m.allow_guest_submit ?? "1") === "1",
      allow_track: (m.allow_track ?? "1") === "1",
      allow_public_update: (m.allow_public_update ?? "1") === "1",
      sender_name: m.sender_name ?? "الدعم الفني",
      sender_email: m.sender_email ?? "",
      stale_hours: parseInt(m.stale_hours ?? "24", 10) || 24,
      base_url: (process.env.APP_BASE_URL || m.base_url || "http://localhost:3000").replace(/\/$/, ""),
      form_fields,
      urgent_form_fields,
      role_permissions,
      user_permissions,
      custom_fields,
      track_cfg,
      estimation_reminders,
    } as Settings;
  };

  return {
    async staffList(activeOnly = false) {
      const q = activeOnly ? "SELECT * FROM staff WHERE active=1 ORDER BY name" : "SELECT * FROM staff ORDER BY name";
      return db.prepare(q).all() as Staff[];
    },
    async staffGet(id) {
      return (db.prepare("SELECT * FROM staff WHERE id=?").get(id) as Staff) ?? null;
    },
    async staffByEmail(email) {
      return (db.prepare("SELECT * FROM staff WHERE lower(email)=lower(?)").get(email) as Staff) ?? null;
    },
    async staffCreate(d) {
      const s: Staff = { id: genId("st"), active: 1, created_at: nowIso(), ...d };
      db.prepare("INSERT INTO staff (id,name,email,role,manager_id,active,created_at) VALUES (?,?,?,?,?,1,?)")
        .run(s.id, s.name, s.email, s.role, s.manager_id, s.created_at);
      return s;
    },
    async staffSetPin(id, pinHash) {
      db.prepare("UPDATE staff SET pin_hash=? WHERE id=?").run(pinHash, id);
    },
    async staffUpdate(id, patch) {
      const cur = await this.staffGet(id);
      if (!cur) return;
      const m = { ...cur, ...patch };
      db.prepare("UPDATE staff SET name=?,email=?,role=?,manager_id=?,active=?,created_at=? WHERE id=?")
        .run(m.name, m.email, m.role, m.manager_id, m.active, m.created_at, m.id);
    },

    async privateLinkCreate(input) {
      const row: PrivateAccessLink = {
        id: genId("plink"), staff_id: input.staff_id, token_hash: input.token_hash,
        label: input.label ?? null, active: true, expires_at: null, last_used_at: null,
        created_by: input.created_by ?? null, created_at: nowIso(), revoked_at: null,
      };
      db.prepare(`INSERT INTO private_access_links
        (id,staff_id,token_hash,label,active,expires_at,last_used_at,created_by,created_at,revoked_at)
        VALUES (?,?,?,?,1,?,?,?,?,?)`)
        .run(row.id, row.staff_id, row.token_hash, row.label, row.expires_at, row.last_used_at, row.created_by, row.created_at, row.revoked_at);
      return row;
    },
    async privateLinkByHash(tokenHash) {
      const r = db.prepare("SELECT * FROM private_access_links WHERE token_hash=? AND active=1").get(tokenHash) as (Omit<PrivateAccessLink, "active"> & { active: number }) | undefined;
      if (!r || (r.expires_at && new Date(r.expires_at).getTime() <= Date.now())) return null;
      return { ...r, active: !!r.active };
    },
    async privateLinksList(staffId) {
      const rows = (staffId
        ? db.prepare("SELECT * FROM private_access_links WHERE staff_id=? ORDER BY created_at DESC").all(staffId)
        : db.prepare("SELECT * FROM private_access_links ORDER BY created_at DESC").all()) as (Omit<PrivateAccessLink, "active"> & { active: number })[];
      return rows.map((r) => ({ ...r, active: !!r.active }));
    },
    async privateLinkTouch(id) {
      db.prepare("UPDATE private_access_links SET last_used_at=? WHERE id=?").run(nowIso(), id);
    },
    async privateLinkRevoke(id) {
      db.prepare("UPDATE private_access_links SET active=0,revoked_at=? WHERE id=?").run(nowIso(), id);
    },

    settingsGet,
    async settingsSet(patch) {
      const ins = db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)");
      if (patch.app_name !== undefined) ins.run("app_name", patch.app_name);
      if (patch.allow_guest_submit !== undefined) ins.run("allow_guest_submit", patch.allow_guest_submit ? "1" : "0");
      if (patch.sender_name !== undefined) ins.run("sender_name", patch.sender_name);
      if (patch.sender_email !== undefined) ins.run("sender_email", patch.sender_email);
      if (patch.stale_hours !== undefined) ins.run("stale_hours", String(patch.stale_hours));
      if (patch.base_url !== undefined) ins.run("base_url", patch.base_url);
      if (patch.form_fields !== undefined) ins.run("form_fields", JSON.stringify(patch.form_fields));
      if (patch.urgent_form_fields !== undefined) ins.run("urgent_form_fields", JSON.stringify(patch.urgent_form_fields));
      if (patch.allow_track !== undefined) ins.run("allow_track", patch.allow_track ? "1" : "0");
      if (patch.allow_public_update !== undefined) ins.run("allow_public_update", patch.allow_public_update ? "1" : "0");
      if (patch.role_permissions !== undefined) ins.run("role_permissions", JSON.stringify(patch.role_permissions));
      if (patch.user_permissions !== undefined) ins.run("user_permissions", JSON.stringify(patch.user_permissions));
      if (patch.custom_fields !== undefined) ins.run("custom_fields", JSON.stringify(patch.custom_fields));
      if (patch.track_cfg !== undefined) ins.run("track_cfg", JSON.stringify(patch.track_cfg));
      if (patch.estimation_reminders !== undefined) ins.run("estimation_reminders", JSON.stringify(patch.estimation_reminders));
    },
    async settingsValueGet(key) {
      const r = db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined;
      return r?.value ?? null;
    },
    async settingsValueSet(key, value) {
      db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").run(key, value);
    },

    // ===== العملاء (القوائم المنسدلة) =====
    async clientsList(activeOnly = false) {
      const q = activeOnly
        ? "SELECT * FROM clients WHERE active=1 ORDER BY name"
        : "SELECT * FROM clients ORDER BY name";
      return db.prepare(q).all() as Client[];
    },
    async clientSave(c) {
      const now = nowIso();
      if (c.id) {
        db.prepare("UPDATE clients SET name=?, contact_email=? WHERE id=?")
          .run(c.name, c.contact_email ?? null, c.id);
        return db.prepare("SELECT * FROM clients WHERE id=?").get(c.id) as Client;
      }
      const id = genId("cl");
      db.prepare("INSERT INTO clients (id,name,contact_email,active,created_at) VALUES (?,?,?,1,?)")
        .run(id, c.name, c.contact_email ?? null, now);
      return db.prepare("SELECT * FROM clients WHERE id=?").get(id) as Client;
    },
    async clientSetActive(id, active) {
      db.prepare("UPDATE clients SET active=? WHERE id=?").run(active ? 1 : 0, id);
    },
    async clientDelete(id) {
      db.prepare("DELETE FROM clients WHERE id=?").run(id);
    },

    async ticketCreate(input) {
      const t = nowIso();
      const ins = db.prepare(`INSERT INTO tickets (
        id,code,client_name,client_contact,title,details,request_type,ticket_kind,priority,overall_status,
        tester_assignment_status,developer_assignment_status,linked_ticket_id,urgent_reason,affected_service,urgent_requested_at,
        created_by,created_by_name,developer_id,developer_name,dev_status,source,last_status_change,created_at,updated_at,
        custom_data,tester_id,tester_name,is_urgent
      ) VALUES (
        @id,@code,@client_name,@client_contact,@title,@details,@request_type,@ticket_kind,@priority,@overall_status,
        @tester_assignment_status,@developer_assignment_status,@linked_ticket_id,@urgent_reason,@affected_service,@urgent_requested_at,
        @created_by,@created_by_name,@developer_id,@developer_name,'new',@source,@stamp,@stamp,@stamp,
        @custom_data,@tester_id,@tester_name,@is_urgent
      )`);
      let code = input.code;
      const id = genId("tk");
      const urgent = input.ticket_kind === "instant_support" || !!input.is_urgent;
      for (let i = 0; i < 5; i++) {
        try {
          ins.run({
            id, code, client_name: input.client_name, client_contact: input.client_contact,
            title: input.title ?? null, details: input.details, request_type: input.request_type ?? "issue",
            ticket_kind: urgent ? "instant_support" : (input.ticket_kind ?? "standard"),
            priority: input.priority ?? (urgent ? "critical" : "normal"),
            overall_status: input.tester_id ? "awaiting_tester" : "new",
            tester_assignment_status: input.tester_id ? "pending" : "unassigned",
            developer_assignment_status: input.developer_id ? "pending" : "unassigned",
            linked_ticket_id: input.linked_ticket_id ?? null, urgent_reason: input.urgent_reason ?? null,
            affected_service: input.affected_service ?? null, urgent_requested_at: urgent ? t : null,
            created_by: input.created_by, created_by_name: input.created_by_name,
            developer_id: input.developer_id, developer_name: input.developer_name,
            source: input.source, stamp: t, custom_data: JSON.stringify(input.custom_data ?? {}),
            tester_id: input.tester_id ?? null, tester_name: input.tester_name ?? null, is_urgent: urgent ? 1 : 0,
          });
          break;
        } catch (e) {
          if (String(e).includes("UNIQUE") && i < 4) { code = genTicketCode(); continue; }
          throw e;
        }
      }
      const r = db.prepare("SELECT * FROM tickets WHERE id=?").get(id) as TicketRow | undefined;
      if (!r) throw new Error("تعذر إنشاء الطلب");
      return mapTicket(r);
    },
    async ticketByCode(code) {
      const r = db.prepare("SELECT * FROM tickets WHERE code=?").get(code) as TicketRow | undefined;
      return r ? mapTicket(r) : null;
    },
    async ticketById(id) {
      const r = db.prepare("SELECT * FROM tickets WHERE id=?").get(id) as TicketRow | undefined;
      return r ? mapTicket(r) : null;
    },
    async ticketList(f: TicketFilter) {
      const where: string[] = [];
      const args: unknown[] = [];
      if (f.q) { where.push("(code LIKE ? OR client_name LIKE ? OR title LIKE ?)"); args.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`); }
      if (f.status) { where.push("dev_status=?"); args.push(f.status); }
      if (f.developer_id) { where.push("developer_id=?"); args.push(f.developer_id); }
      if (f.tester_id) { where.push("tester_id=?"); args.push(f.tester_id); }
      if (f.created_by) { where.push("created_by=?"); args.push(f.created_by); }
      if (f.request_type) { where.push("request_type=?"); args.push(f.request_type); }
      if (f.ticket_kind) { where.push("ticket_kind=?"); args.push(f.ticket_kind); }
      if (f.source) { where.push("source=?"); args.push(f.source); }
      if (f.involvesStaffId) {
        where.push("(created_by=? OR developer_id=? OR tester_id=? OR (tester_id IS NULL AND developer_id IS NULL))");
        args.push(f.involvesStaffId, f.involvesStaffId, f.involvesStaffId);
      }
      if (f.staleOlderThanHours) {
        const cutoff = new Date(Date.now() - f.staleOlderThanHours * 3600000).toISOString();
        where.push("last_status_change < ?"); args.push(cutoff);
      }
      const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const total = (db.prepare(`SELECT COUNT(*) c FROM tickets ${w}`).get(...args) as { c: number }).c;
      const page = f.page ?? 1, size = f.pageSize ?? 15;
      const rows = (db.prepare(`SELECT * FROM tickets ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(...args, size, (page - 1) * size) as TicketRow[]).map(mapTicket);
      return { rows, total };
    },
    async ticketUpdate(id, patch) {
      const sets: string[] = [];
      const args: unknown[] = [];
      const fields = [
        "client_name", "client_contact", "title", "details", "request_type", "ticket_kind", "priority", "overall_status",
        "tester_assignment_status", "developer_assignment_status", "linked_ticket_id", "urgent_reason", "affected_service",
        "urgent_requested_at", "urgent_started_at", "urgent_ended_at", "urgent_result", "actual_minutes", "version",
        "developer_id", "developer_name", "dev_status", "last_status_change", "updated_at", "tester_id", "tester_name",
        "est_hours", "est_days", "dev_est_days", "dev_est_hours", "test_est_days", "test_est_hours", "dev_started_at", "test_started_at", "is_urgent",
      ] as const;
      for (const k of fields) {
        if (patch[k] !== undefined) { sets.push(`${k}=?`); args.push(patch[k] as unknown); }
      }
      if (patch.reminders_sent !== undefined) {
        sets.push("reminders_sent=?");
        args.push(patch.reminders_sent ? JSON.stringify(patch.reminders_sent) : null);
      }
      if (sets.length) {
        args.push(id);
        db.prepare(`UPDATE tickets SET ${sets.join(",")} WHERE id=?`).run(...args);
      }
      return this.ticketById(id);
    },
    async ticketCounts() {
      const rows = db.prepare("SELECT dev_status, COUNT(*) c FROM tickets GROUP BY dev_status").all() as { dev_status: string; c: number }[];
      const byStatus: Record<string, number> = {};
      let total = 0;
      rows.forEach((r) => { byStatus[r.dev_status] = r.c; total += r.c; });
      return { total, byStatus };
    },

    async assignmentCreate(a) {
      db.prepare("UPDATE ticket_assignments SET is_current=0,status='reassigned' WHERE ticket_id=? AND assignment_role=? AND is_current=1")
        .run(a.ticket_id, a.assignment_role);
      const row: TicketAssignment = {
        id: genId("asg"), ...a, status: "pending", decline_reason: null,
        assigned_at: nowIso(), responded_at: null, completed_at: null, is_current: true,
      };
      db.prepare(`INSERT INTO ticket_assignments
        (id,ticket_id,assignment_role,staff_id,status,decline_reason,assigned_by,assigned_at,responded_at,completed_at,is_current)
        VALUES (?,?,?,?,?,?,?,?,?,?,1)`)
        .run(row.id, row.ticket_id, row.assignment_role, row.staff_id, row.status, row.decline_reason, row.assigned_by, row.assigned_at, row.responded_at, row.completed_at);
      return row;
    },
    async assignmentCurrent(ticketId, role) {
      const r = db.prepare("SELECT * FROM ticket_assignments WHERE ticket_id=? AND assignment_role=? AND is_current=1 ORDER BY assigned_at DESC LIMIT 1")
        .get(ticketId, role) as (Omit<TicketAssignment, "is_current"> & { is_current: number }) | undefined;
      return r ? { ...r, is_current: !!r.is_current } : null;
    },
    async assignmentRespond(id, status, reason = null) {
      db.prepare("UPDATE ticket_assignments SET status=?,decline_reason=?,responded_at=?,is_current=? WHERE id=?")
        .run(status, status === "declined" ? reason : null, nowIso(), status === "declined" ? 0 : 1, id);
      const r = db.prepare("SELECT * FROM ticket_assignments WHERE id=?").get(id) as (Omit<TicketAssignment, "is_current"> & { is_current: number }) | undefined;
      return r ? { ...r, is_current: !!r.is_current } : null;
    },
    async assignmentComplete(ticketId, role) {
      db.prepare("UPDATE ticket_assignments SET status='completed',completed_at=? WHERE ticket_id=? AND assignment_role=? AND is_current=1")
        .run(nowIso(), ticketId, role);
    },
    async assignmentList(ticketId) {
      const rows = db.prepare("SELECT * FROM ticket_assignments WHERE ticket_id=? ORDER BY assigned_at DESC").all(ticketId) as (Omit<TicketAssignment, "is_current"> & { is_current: number })[];
      return rows.map((r) => ({ ...r, is_current: !!r.is_current }));
    },

    async meetingCreate(m) {
      const now = nowIso();
      const row: Meeting = { id: genId("meet"), ...m, created_at: now, updated_at: now };
      db.prepare(`INSERT INTO meetings (id,ticket_id,provider,provider_meeting_id,subject,starts_at,ends_at,join_url,organizer_staff_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(row.id,row.ticket_id,row.provider,row.provider_meeting_id,row.subject,row.starts_at,row.ends_at,row.join_url,row.organizer_staff_id,row.status,row.created_at,row.updated_at);
      return row;
    },
    async meetingList(ticketId) { return db.prepare("SELECT * FROM meetings WHERE ticket_id=? ORDER BY starts_at DESC").all(ticketId) as Meeting[]; },
    async meetingGet(id) { return (db.prepare("SELECT * FROM meetings WHERE id=?").get(id) as Meeting) ?? null; },
    async meetingUpdate(id, patch) {
      const old = await this.meetingGet(id); if (!old) return null; const m = { ...old, ...patch, updated_at: nowIso() };
      db.prepare("UPDATE meetings SET provider_meeting_id=?,subject=?,starts_at=?,ends_at=?,join_url=?,status=?,updated_at=? WHERE id=?")
        .run(m.provider_meeting_id,m.subject,m.starts_at,m.ends_at,m.join_url,m.status,m.updated_at,id);
      return m;
    },
    async meetingParticipantsAdd(items) {
      const q=db.prepare("INSERT INTO meeting_participants(id,meeting_id,staff_id,email,response_status,joined_at,left_at) VALUES (?,?,?,?,?,?,?)");
      items.forEach((x)=>q.run(genId("mp"),x.meeting_id,x.staff_id,x.email,x.response_status,x.joined_at,x.left_at));
    },
    async meetingParticipantsList(meetingId) { return db.prepare("SELECT * FROM meeting_participants WHERE meeting_id=?").all(meetingId) as MeetingParticipant[]; },

    async auditAdd(e) {
      const created_at = nowIso();
      const r = db.prepare(`INSERT INTO audit_log
        (entity_type,entity_id,action,actor_staff_id,actor_label,old_values,new_values,request_ip,user_agent,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(e.entity_type, e.entity_id, e.action, e.actor_staff_id ?? null, e.actor_label ?? null,
          e.old_values ? JSON.stringify(e.old_values) : null, e.new_values ? JSON.stringify(e.new_values) : null,
          e.request_ip ?? null, e.user_agent ?? null, created_at);
      return {
        id: Number(r.lastInsertRowid), entity_type: e.entity_type, entity_id: e.entity_id, action: e.action,
        actor_staff_id: e.actor_staff_id ?? null, actor_label: e.actor_label ?? null,
        old_values: e.old_values ?? null, new_values: e.new_values ?? null,
        request_ip: e.request_ip ?? null, user_agent: e.user_agent ?? null, created_at,
      } as AuditEntry;
    },
    async auditList(entityType, entityId) {
      const rows = db.prepare("SELECT * FROM audit_log WHERE entity_type=? AND entity_id=? ORDER BY created_at DESC")
        .all(entityType, entityId) as (Omit<AuditEntry, "old_values" | "new_values"> & { old_values: string | null; new_values: string | null })[];
      return rows.map((r) => ({ ...r, old_values: r.old_values ? JSON.parse(r.old_values) : null, new_values: r.new_values ? JSON.parse(r.new_values) : null }));
    },

    async eventAdd(e) {
      const t = nowIso();
      const r = db.prepare("INSERT INTO events (ticket_id,type,actor_label,old_values,new_values,created_at) VALUES (?,?,?,?,?,?)")
        .run(e.ticket_id, e.type, e.actor_label, e.old_values ? JSON.stringify(e.old_values) : null, e.new_values ? JSON.stringify(e.new_values) : null, t);
      return { id: Number(r.lastInsertRowid), created_at: t, ...e } as TicketEvent;
    },
    async eventList(ticketId) {
      const rows = db.prepare("SELECT * FROM events WHERE ticket_id=? ORDER BY id DESC").all(ticketId) as Record<string, unknown>[];
      return rows.map((r) => ({
        ...(r as unknown as TicketEvent),
        old_values: r.old_values ? JSON.parse(r.old_values as string) : null,
        new_values: r.new_values ? JSON.parse(r.new_values as string) : null,
      }));
    },

    async rulesList() {
      return (db.prepare("SELECT * FROM automation_rules ORDER BY created_at").all() as Record<string, unknown>[]).map(mapRule);
    },
    async rulesEnabled() {
      return (db.prepare("SELECT * FROM automation_rules WHERE enabled=1").all() as Record<string, unknown>[]).map(mapRule);
    },
    async ruleUpsert(r) {
      const t = nowIso();
      if (r.id) {
        db.prepare("UPDATE automation_rules SET name=?,trigger_type=?,trigger_field=?,conditions=?,actions=?,enabled=? WHERE id=?")
          .run(r.name, r.trigger_type, r.trigger_field, JSON.stringify(r.conditions), JSON.stringify(r.actions), r.enabled, r.id);
        return mapRule(db.prepare("SELECT * FROM automation_rules WHERE id=?").get(r.id) as Record<string, unknown>);
      }
      const id = genId("rule");
      db.prepare("INSERT INTO automation_rules (id,name,trigger_type,trigger_field,conditions,actions,enabled,run_count,created_at) VALUES (?,?,?,?,?,?,?,0,?)")
        .run(id, r.name, r.trigger_type, r.trigger_field, JSON.stringify(r.conditions), JSON.stringify(r.actions), r.enabled, t);
      return mapRule(db.prepare("SELECT * FROM automation_rules WHERE id=?").get(id) as Record<string, unknown>);
    },
    async ruleDelete(id) {
      db.prepare("DELETE FROM automation_rules WHERE id=?").run(id);
    },
    async ruleBump(id) {
      db.prepare("UPDATE automation_rules SET run_count=run_count+1 WHERE id=?").run(id);
    },

    async jobEnqueue(j) {
      try {
        const runAfter = new Date(Date.now() + (j.delaySeconds ?? 0) * 1000).toISOString();
        db.prepare("INSERT INTO jobs (id,idempotency_key,type,payload,status,attempts,max_attempts,run_after,created_at) VALUES (?,?,?,?,'queued',0,5,?,?)")
          .run(genId("job"), j.idempotency_key, j.type, JSON.stringify(j.payload), runAfter, nowIso());
        return "created";
      } catch (e) {
        if (String(e).includes("UNIQUE")) return "dup";
        throw e;
      }
    },
    async jobsDue(limit) {
      const rows = db.prepare("SELECT * FROM jobs WHERE status='queued' AND run_after<=? ORDER BY run_after LIMIT ?")
        .all(nowIso(), limit) as Record<string, unknown>[];
      return rows.map(mapJob);
    },
    async jobClaim(id) {
      const r = db.prepare("UPDATE jobs SET status='processing' WHERE id=? AND status='queued'").run(id);
      return r.changes > 0;
    },
    async jobDone(id) {
      db.prepare("UPDATE jobs SET status='done', processed_at=? WHERE id=?").run(nowIso(), id);
    },
    async jobFail(id, err, retryAtIso) {
      if (retryAtIso) {
        db.prepare("UPDATE jobs SET status='queued', attempts=attempts+1, run_after=?, last_error=? WHERE id=?").run(retryAtIso, err, id);
      } else {
        db.prepare("UPDATE jobs SET status='dead', attempts=attempts+1, last_error=?, processed_at=? WHERE id=?").run(err, nowIso(), id);
      }
    },

    async templateList() {
      const rows = db.prepare("SELECT * FROM email_templates ORDER BY name").all() as (Omit<EmailTemplate, "blocks"> & { blocks: string | null })[];
      return rows.map(mapTemplate);
    },
    async templateGet(id) {
      const r = db.prepare("SELECT * FROM email_templates WHERE id=?").get(id) as (Omit<EmailTemplate, "blocks"> & { blocks: string | null }) | undefined;
      return r ? mapTemplate(r) : null;
    },
    async templateUpsert(t) {
      const now = nowIso();
      const blocksJson = t.blocks === undefined ? undefined : t.blocks === null ? null : JSON.stringify(t.blocks);
      if (t.id) {
        if (blocksJson !== undefined) {
          db.prepare("UPDATE email_templates SET name=?,subject=?,body_html=?,blocks=?,updated_at=? WHERE id=?")
            .run(t.name, t.subject, t.body_html, blocksJson, now, t.id);
        } else {
          db.prepare("UPDATE email_templates SET name=?,subject=?,body_html=?,updated_at=? WHERE id=?")
            .run(t.name, t.subject, t.body_html, now, t.id);
        }
        return mapTemplate(db.prepare("SELECT * FROM email_templates WHERE id=?").get(t.id) as Omit<EmailTemplate, "blocks"> & { blocks: string | null });
      }
      const id = genId("tmpl");
      db.prepare("INSERT INTO email_templates (id,name,subject,body_html,blocks,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
        .run(id, t.name, t.subject, t.body_html, blocksJson ?? null, now, now);
      return mapTemplate(db.prepare("SELECT * FROM email_templates WHERE id=?").get(id) as Omit<EmailTemplate, "blocks"> & { blocks: string | null });
    },
    async templateDelete(id) {
      db.prepare("DELETE FROM email_templates WHERE id=?").run(id);
    },

    async emailLogAdd(e) {
      const row: EmailLog = { id: e.id ?? genId("eml"), created_at: nowIso(), ...e } as EmailLog;
      db.prepare(`INSERT INTO email_log (id,job_id,ticket_id,to_addr,cc_addr,provider,provider_msg_id,subject,body_html,status,error,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(row.id, row.job_id, row.ticket_id, row.to_addr, row.cc_addr, row.provider, row.provider_msg_id, row.subject, row.body_html, row.status, row.error, row.created_at);
      return row;
    },
    async emailLogSetProvider(id, provider, msgId, status, error = null) {
      db.prepare("UPDATE email_log SET provider=?, provider_msg_id=?, status=?, error=? WHERE id=?").run(provider, msgId, status, error, id);
    },
    async emailLogSetStatusByMsg(msgId, status, error = null) {
      db.prepare("UPDATE email_log SET status=?, error=? WHERE provider_msg_id=?").run(status, error, msgId);
    },
    async emailLogList(page = 1, pageSize = 20, ticketId) {
      const w = ticketId ? "WHERE ticket_id=?" : "";
      const args = ticketId ? [ticketId] : [];
      const total = (db.prepare(`SELECT COUNT(*) c FROM email_log ${w}`).get(...args) as { c: number }).c;
      const rows = db.prepare(`SELECT * FROM email_log ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(...args, pageSize, (page - 1) * pageSize) as EmailLog[];
      return { rows, total };
    },

    async notifyAdd(n) {
      db.prepare("INSERT INTO notifications (id,staff_id,ticket_id,message,read_at,created_at) VALUES (?,?,?,?,NULL,?)")
        .run(genId("ntf"), n.staff_id, n.ticket_id, n.message, nowIso());
    },
    async notificationsList(staffId) {
      return db.prepare("SELECT * FROM notifications WHERE staff_id=? ORDER BY created_at DESC LIMIT 50").all(staffId) as Notification[];
    },
    async notificationsUnread(staffId) {
      return (db.prepare("SELECT COUNT(*) c FROM notifications WHERE staff_id=? AND read_at IS NULL").get(staffId) as { c: number }).c;
    },
    async notificationsMarkRead(staffId) {
      db.prepare("UPDATE notifications SET read_at=? WHERE staff_id=? AND read_at IS NULL").run(nowIso(), staffId);
    },

    async attachmentAdd(a) {
      const row: Attachment = { ...a, created_at: nowIso() };
      db.prepare("INSERT INTO attachments (id,ticket_id,file_name,size_bytes,path,driver,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .run(row.id, row.ticket_id, row.file_name, row.size_bytes, row.path, row.driver, row.uploaded_by, row.created_at);
      return row;
    },
    async attachmentList(ticketId) {
      return db.prepare("SELECT * FROM attachments WHERE ticket_id=? ORDER BY created_at DESC").all(ticketId) as Attachment[];
    },
    async attachmentGet(id) {
      return (db.prepare("SELECT * FROM attachments WHERE id=?").get(id) as Attachment) ?? null;
    },
  };
}
