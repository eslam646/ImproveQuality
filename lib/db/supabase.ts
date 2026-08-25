import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Repo, TicketFilter } from "./index";
import type { AuditEntry, Client, CustomFieldCfg, DevSpecialization, EmailLog, EstimationReminderCfg, FormFieldCfg, Job, Meeting, MeetingParticipant, PermKey, PrivateAccessLink, Role, RolePermissions, Settings, Staff, Ticket, TicketAssignment, TicketSpecialist, TicketEvent, TrackPageCfg, UrgentFormFieldCfg, UserPermissionOverrides } from "../types";
import { DEFAULT_FORM_FIELDS, DEFAULT_ROLE_PERMISSIONS, DEFAULT_TRACK_CFG,
  DEFAULT_ESTIMATION_REMINDERS, DEFAULT_DEV_SPECIALIZATIONS, DEFAULT_URGENT_FORM_FIELDS } from "../types";
import { SEED_RULES, SEED_STAFF, SEED_TEMPLATES, SEED_TICKETS } from "../seed";
import { genId, genTicketCode, nowIso } from "../util";

// تنفيذ Supabase عبر REST (PostgREST) — يعمل على Cloudflare/Vercel بلا مشاكل TCP
export async function createSupabaseRepo(): Promise<Repo> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان عند DB_DRIVER=supabase");
  // Node < 22 لا يملك WebSocket أصيلاً (مطلوب فقط لتهيئة عميل Supabase — لا نستخدم Realtime)
  if (typeof globalThis.WebSocket === "undefined") {
    const ws = await import("ws");
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = ws.WebSocket;
  }
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

  const must = <T>(res: { data: T | null; error: { message: string } | null }): T => {
    if (res.error) throw new Error(`Supabase: ${res.error.message}`);
    return res.data as T;
  };

  // بذر تلقائي عند أول تشغيل (البيانات التجريبية + الإعدادات)
  const { count } = await sb.from("staff").select("id", { count: "exact", head: true });
  if (!count) {
    await sb.from("staff").insert(SEED_STAFF);
    await sb.from("tickets").insert(SEED_TICKETS as Ticket[]);
    await sb.from("email_templates").insert(SEED_TEMPLATES);
    await sb.from("automation_rules").insert(SEED_RULES);
    await sb.from("settings").upsert([
      { key: "app_name", value: "بوابة الدعم الفني" },
      { key: "allow_guest_submit", value: "1" },
      { key: "sender_name", value: process.env.EMAIL_FROM_NAME || "الدعم الفني" },
      { key: "sender_email", value: process.env.EMAIL_FROM_ADDRESS || "" },
      { key: "stale_hours", value: process.env.STALE_HOURS || "24" },
      { key: "base_url", value: process.env.APP_BASE_URL || "http://localhost:3000" },
    ]);
  }
  // إضافة القوالب والقواعد الافتراضية الجديدة فقط بدون استبدال أي تعديلات أجراها الأدمن
  await sb.from("email_templates").upsert(SEED_TEMPLATES, { onConflict: "id", ignoreDuplicates: true });
  await sb.from("automation_rules").upsert(SEED_RULES, { onConflict: "id", ignoreDuplicates: true });

  const settingsGet: Repo["settingsGet"] = async () => {
    const rows = must(await sb.from("settings").select("key,value")) as { key: string; value: string }[];
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
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
    // مصفوفة الصلاحيات: دمج المحفوظ فوق الافتراضي (أي صفحة جديدة تُورث الافتراضي الآمن)
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
    // تخصصات التطوير (باك/فرونت/UX) — يحددها الأدمن
    let dev_specializations: DevSpecialization[] = DEFAULT_DEV_SPECIALIZATIONS;
    if (m.dev_specializations) {
      try {
        const saved = JSON.parse(m.dev_specializations) as DevSpecialization[];
        if (Array.isArray(saved) && saved.length) dev_specializations = saved.filter((x) => x && typeof x.key === "string" && typeof x.label === "string");
      } catch { /* الافتراضي */ }
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
      dev_specializations,
    } as Settings;
  };

  return {
    async staffList(activeOnly = false) {
      let q = sb.from("staff").select("*").order("name");
      if (activeOnly) q = q.eq("active", 1 as unknown as number);
      return must(await q) as Staff[];
    },
    async staffGet(id) {
      const { data } = await sb.from("staff").select("*").eq("id", id).maybeSingle();
      return (data as Staff) ?? null;
    },
    async staffByEmail(email) {
      const { data } = await sb.from("staff").select("*").ilike("email", email).maybeSingle();
      return (data as Staff) ?? null;
    },
    async staffCreate(d) {
      const s: Staff = { id: genId("st"), active: 1, created_at: nowIso(), ...d };
      must(await sb.from("staff").insert(s));
      return s;
    },
    async staffSetPin(id, pinHash) {
      must(await sb.from("staff").update({ pin_hash: pinHash }).eq("id", id));
    },
    async staffUpdate(id, patch) {
      must(await sb.from("staff").update(patch).eq("id", id));
    },

    async privateLinkCreate(input) {
      const row = {
        id: genId("plink"), staff_id: input.staff_id, token_hash: input.token_hash,
        kind: input.kind ?? "request",
        label: input.label ?? null, active: true, expires_at: null, last_used_at: null,
        created_by: input.created_by ?? null, created_at: nowIso(), revoked_at: null,
      };
      const { data } = await sb.from("private_access_links").insert(row).select().single();
      return data as PrivateAccessLink;
    },
    async privateLinkByHash(tokenHash) {
      const { data } = await sb.from("private_access_links").select("*")
        .eq("token_hash", tokenHash).eq("active", true).maybeSingle();
      const link = (data as PrivateAccessLink) ?? null;
      if (link?.expires_at && new Date(link.expires_at).getTime() <= Date.now()) return null;
      return link;
    },
    async privateLinkGet(id) {
      const { data } = await sb.from("private_access_links").select("*").eq("id", id).maybeSingle();
      return (data as PrivateAccessLink) ?? null;
    },
    async privateLinksList(staffId) {
      let q = sb.from("private_access_links").select("*").order("created_at", { ascending: false });
      if (staffId) q = q.eq("staff_id", staffId);
      return (must(await q) as PrivateAccessLink[]) ?? [];
    },
    async privateLinkTouch(id) {
      await sb.from("private_access_links").update({ last_used_at: nowIso() }).eq("id", id);
    },
    async privateLinkRevoke(id) {
      await sb.from("private_access_links").update({ active: false, revoked_at: nowIso() }).eq("id", id);
    },

    settingsGet,
    async settingsSet(patch) {
      const rows: { key: string; value: string }[] = [];
      if (patch.app_name !== undefined) rows.push({ key: "app_name", value: patch.app_name });
      if (patch.allow_guest_submit !== undefined) rows.push({ key: "allow_guest_submit", value: patch.allow_guest_submit ? "1" : "0" });
      if (patch.sender_name !== undefined) rows.push({ key: "sender_name", value: patch.sender_name });
      if (patch.sender_email !== undefined) rows.push({ key: "sender_email", value: patch.sender_email });
      if (patch.stale_hours !== undefined) rows.push({ key: "stale_hours", value: String(patch.stale_hours) });
      if (patch.base_url !== undefined) rows.push({ key: "base_url", value: patch.base_url });
      if (patch.form_fields !== undefined) rows.push({ key: "form_fields", value: JSON.stringify(patch.form_fields) });
      if (patch.urgent_form_fields !== undefined) rows.push({ key: "urgent_form_fields", value: JSON.stringify(patch.urgent_form_fields) });
      if (patch.allow_track !== undefined) rows.push({ key: "allow_track", value: patch.allow_track ? "1" : "0" });
      if (patch.allow_public_update !== undefined) rows.push({ key: "allow_public_update", value: patch.allow_public_update ? "1" : "0" });
      if (patch.role_permissions !== undefined) rows.push({ key: "role_permissions", value: JSON.stringify(patch.role_permissions) });
      if (patch.user_permissions !== undefined) rows.push({ key: "user_permissions", value: JSON.stringify(patch.user_permissions) });
      if (patch.custom_fields !== undefined) rows.push({ key: "custom_fields", value: JSON.stringify(patch.custom_fields) });
      if (patch.track_cfg !== undefined) rows.push({ key: "track_cfg", value: JSON.stringify(patch.track_cfg) });
      if (patch.estimation_reminders !== undefined) rows.push({ key: "estimation_reminders", value: JSON.stringify(patch.estimation_reminders) });
      if (patch.dev_specializations !== undefined) rows.push({ key: "dev_specializations", value: JSON.stringify(patch.dev_specializations) });
      if (rows.length) must(await sb.from("settings").upsert(rows));
    },
    async settingsValueGet(key) {
      const { data } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
      return (data as { value: string } | null)?.value ?? null;
    },
    async settingsValueSet(key, value) {
      must(await sb.from("settings").upsert({ key, value }));
    },

    async clientsList(activeOnly = false) {
      let q = sb.from("clients").select("*").order("name");
      if (activeOnly) q = q.eq("active", 1 as unknown as number);
      return must(await q) as Client[];
    },
    async clientSave(c) {
      if (c.id) {
        const { data } = await sb.from("clients").update({ name: c.name, contact_email: c.contact_email ?? null }).eq("id", c.id).select().single();
        return data as Client;
      }
      const { data } = await sb.from("clients")
        .insert({ id: genId("cl"), name: c.name, contact_email: c.contact_email ?? null, active: 1, created_at: new Date().toISOString() })
        .select().single();
      return data as Client;
    },
    async clientSetActive(id, active) {
      must(await sb.from("clients").update({ active: active ? 1 : 0 }).eq("id", id));
    },
    async clientDelete(id) {
      must(await sb.from("clients").delete().eq("id", id));
    },

    async ticketCreate(input) {
      const t = nowIso();
      for (let i = 0; i < 5; i++) {
        const code = i === 0 ? input.code : genTicketCode();
        const row = {
          id: genId("tk"), code, client_name: input.client_name, client_contact: input.client_contact,
          title: input.title ?? null, details: input.details,
          request_type: input.request_type ?? "issue",
          ticket_kind: input.ticket_kind ?? (input.is_urgent ? "instant_support" : "standard"),
          priority: input.priority ?? (input.is_urgent ? "critical" : "normal"),
          overall_status: input.tester_id ? "awaiting_tester" : "new",
          tester_assignment_status: input.tester_id ? "pending" : "unassigned",
          developer_assignment_status: input.developer_id ? "pending" : "unassigned",
          linked_ticket_id: input.linked_ticket_id ?? null,
          urgent_reason: input.urgent_reason ?? null,
          affected_service: input.affected_service ?? null,
          urgent_requested_at: input.is_urgent ? t : null,
          created_by: input.created_by, created_by_name: input.created_by_name,
          developer_id: input.developer_id, developer_name: input.developer_name,
          dev_status: "new", source: input.source, last_status_change: t, created_at: t, updated_at: t,
          custom_data: input.custom_data ?? {},
          tester_id: input.tester_id ?? null, tester_name: input.tester_name ?? null, is_urgent: input.is_urgent ?? false,
        };
        const { data, error } = await sb.from("tickets").insert(row).select().single();
        if (!error) return data as Ticket;
        if (!String(error.message).toLowerCase().includes("duplicate")) throw new Error(error.message);
      }
      throw new Error("تعذر توليد كود فريد");
    },
    async ticketByCode(code) {
      const { data } = await sb.from("tickets").select("*").eq("code", code).maybeSingle();
      return (data as Ticket) ?? null;
    },
    async ticketById(id) {
      const { data } = await sb.from("tickets").select("*").eq("id", id).maybeSingle();
      return (data as Ticket) ?? null;
    },
    async ticketList(f: TicketFilter) {
      let q = sb.from("tickets").select("*", { count: "exact" });
      if (f.q) q = q.or(`code.ilike.%${f.q}%,client_name.ilike.%${f.q}%,title.ilike.%${f.q}%`);
      if (f.status) q = q.eq("dev_status", f.status);
      if (f.developer_id) q = q.eq("developer_id", f.developer_id);
      if (f.tester_id) q = q.eq("tester_id", f.tester_id);
      if (f.created_by) q = q.eq("created_by", f.created_by);
      if (f.request_type) q = q.eq("request_type", f.request_type);
      if (f.ticket_kind) q = q.eq("ticket_kind", f.ticket_kind);
      if (f.source) q = q.eq("source", f.source);
      if (f.involvesStaffId) {
        // يخصّني: منشئ/مطور/مختبِر/متخصص (باك-فرونت-UX) — أو تذكرة جديدة لم تُسند بعد
        const id = f.involvesStaffId;
        const { data: specRows } = await sb.from("ticket_specialists").select("ticket_id").eq("staff_id", id).eq("is_current", true);
        const specIds = [...new Set((specRows ?? []).map((r) => (r as { ticket_id: string }).ticket_id))];
        const orParts = [`created_by.eq.${id}`, `developer_id.eq.${id}`, `tester_id.eq.${id}`, `and(tester_id.is.null,developer_id.is.null)`];
        if (specIds.length) orParts.push(`id.in.(${specIds.join(",")})`);
        q = q.or(orParts.join(","));
      }
      if (f.staleOlderThanHours) {
        const cutoff = new Date(Date.now() - f.staleOlderThanHours * 3600000).toISOString();
        q = q.lt("last_status_change", cutoff);
      }
      const page = f.page ?? 1, size = f.pageSize ?? 15;
      // الترتيب: الأحدث إنشاءً (الافتراضي) أو الأحدث تعديلاً
      q = (f.sort === "updated" ? q.order("updated_at", { ascending: false, nullsFirst: false }) : q.order("created_at", { ascending: false }))
        .range((page - 1) * size, page * size - 1);
      const res = await q;
      return { rows: (must(res) as Ticket[]) ?? [], total: res.count ?? 0 };
    },
    async ticketUpdate(id, patch) {
      const { data } = await sb.from("tickets").update(patch).eq("id", id).select().maybeSingle();
      return (data as Ticket) ?? null;
    },
    async ticketCounts() {
      const rows = must(await sb.from("tickets").select("dev_status")) as { dev_status: string }[];
      const byStatus: Record<string, number> = {};
      rows.forEach((r) => { byStatus[r.dev_status] = (byStatus[r.dev_status] ?? 0) + 1; });
      return { total: rows.length, byStatus };
    },

    async assignmentCreate(a) {
      // الإسناد الجديد يجعل أي إسناد حالي سابق لنفس الدور غير حالي
      await sb.from("ticket_assignments").update({ is_current: false, status: "reassigned" })
        .eq("ticket_id", a.ticket_id).eq("assignment_role", a.assignment_role).eq("is_current", true);
      const row = {
        id: genId("asg"), ...a, status: "pending", decline_reason: null,
        assigned_at: nowIso(), responded_at: null, completed_at: null, is_current: true,
      };
      const { data } = await sb.from("ticket_assignments").insert(row).select().single();
      return data as TicketAssignment;
    },
    async assignmentCurrent(ticketId, role) {
      const { data } = await sb.from("ticket_assignments").select("*")
        .eq("ticket_id", ticketId).eq("assignment_role", role).eq("is_current", true)
        .order("assigned_at", { ascending: false }).limit(1).maybeSingle();
      return (data as TicketAssignment) ?? null;
    },
    async assignmentRespond(id, status, reason = null) {
      const { data } = await sb.from("ticket_assignments").update({
        status, decline_reason: status === "declined" ? reason : null,
        responded_at: nowIso(), is_current: status !== "declined",
      }).eq("id", id).select().maybeSingle();
      return (data as TicketAssignment) ?? null;
    },
    async assignmentComplete(ticketId, role) {
      await sb.from("ticket_assignments").update({ status: "completed", completed_at: nowIso() })
        .eq("ticket_id", ticketId).eq("assignment_role", role).eq("is_current", true);
    },
    async assignmentList(ticketId) {
      return (must(await sb.from("ticket_assignments").select("*").eq("ticket_id", ticketId).order("assigned_at", { ascending: false })) as TicketAssignment[]) ?? [];
    },

    async specialistAdd(sp) {
      // يُسمح بأكثر من شخص لنفس التخصص — الإزالة تتم صراحة عبر specialistRemove
      const row = {
        id: genId("spc"), ticket_id: sp.ticket_id, spec_key: sp.spec_key, spec_label: sp.spec_label,
        staff_id: sp.staff_id, staff_name: sp.staff_name, status: "pending",
        est_days: sp.est_days ?? null, est_hours: sp.est_hours ?? null,
        started_at: null, ready_at: null, decline_reason: null, reminders_sent: null,
        assigned_by: sp.assigned_by ?? null, assigned_at: nowIso(), responded_at: null, is_current: true,
      };
      const { data } = await sb.from("ticket_specialists").insert(row).select().single();
      return data as TicketSpecialist;
    },
    async specialistList(ticketId) {
      return (must(await sb.from("ticket_specialists").select("*").eq("ticket_id", ticketId).eq("is_current", true).order("assigned_at")) as TicketSpecialist[]) ?? [];
    },
    async specialistGet(id) {
      const { data } = await sb.from("ticket_specialists").select("*").eq("id", id).maybeSingle();
      return (data as TicketSpecialist) ?? null;
    },
    async specialistUpdate(id, patch) {
      const { data } = await sb.from("ticket_specialists").update(patch).eq("id", id).select().maybeSingle();
      return (data as TicketSpecialist) ?? null;
    },
    async specialistRemove(id) {
      await sb.from("ticket_specialists").update({ is_current: false }).eq("id", id);
    },

    async meetingCreate(m) {
      const now = nowIso();
      const row = { id: genId("meet"), ...m, created_at: now, updated_at: now };
      const { data } = await sb.from("meetings").insert(row).select().single();
      return data as Meeting;
    },
    async meetingList(ticketId) {
      return (must(await sb.from("meetings").select("*").eq("ticket_id", ticketId).order("starts_at", { ascending: false })) as Meeting[]) ?? [];
    },
    async meetingGet(id) {
      const { data } = await sb.from("meetings").select("*").eq("id", id).maybeSingle();
      return (data as Meeting) ?? null;
    },
    async meetingUpdate(id, patch) {
      const { data } = await sb.from("meetings").update({ ...patch, updated_at: nowIso() }).eq("id", id).select().maybeSingle();
      return (data as Meeting) ?? null;
    },
    async meetingParticipantsAdd(items) {
      if (!items.length) return;
      must(await sb.from("meeting_participants").insert(items.map((x) => ({ id: genId("mp"), ...x }))));
    },
    async meetingParticipantsList(meetingId) {
      return (must(await sb.from("meeting_participants").select("*").eq("meeting_id", meetingId)) as MeetingParticipant[]) ?? [];
    },

    async auditAdd(e) {
      const row = {
        entity_type: e.entity_type, entity_id: e.entity_id, action: e.action,
        actor_staff_id: e.actor_staff_id ?? null, actor_label: e.actor_label ?? null,
        old_values: e.old_values ?? null, new_values: e.new_values ?? null,
        request_ip: e.request_ip ?? null, user_agent: e.user_agent ?? null, created_at: nowIso(),
      };
      const { data } = await sb.from("audit_log").insert(row).select().single();
      return data as AuditEntry;
    },
    async auditList(entityType, entityId) {
      return (must(await sb.from("audit_log").select("*").eq("entity_type", entityType).eq("entity_id", entityId).order("created_at", { ascending: false })) as AuditEntry[]) ?? [];
    },

    async eventAdd(e) {
      const row = { ...e, created_at: nowIso() };
      const { data } = await sb.from("events").insert(row).select().single();
      return data as TicketEvent;
    },
    async eventList(ticketId) {
      return (must(await sb.from("events").select("*").eq("ticket_id", ticketId).order("id", { ascending: false })) as TicketEvent[]) ?? [];
    },

    async rulesList() {
      return (must(await sb.from("automation_rules").select("*").order("created_at")) as Repo extends never ? never : import("../types").AutomationRule[]) ?? [];
    },
    async rulesEnabled() {
      return (must(await sb.from("automation_rules").select("*").eq("enabled", 1)))!;
    },
    async ruleUpsert(r) {
      if (r.id) {
        const { data } = await sb.from("automation_rules")
          .update({ name: r.name, trigger_type: r.trigger_type, trigger_field: r.trigger_field, conditions: r.conditions, actions: r.actions, enabled: r.enabled })
          .eq("id", r.id).select().single();
        return data!;
      }
      const row = { id: genId("rule"), ...r, run_count: 0, created_at: nowIso() };
      const { data } = await sb.from("automation_rules").insert(row).select().single();
      return data!;
    },
    async ruleDelete(id) { must(await sb.from("automation_rules").delete().eq("id", id)); },
    async ruleBump(id) {
      const { data } = await sb.from("automation_rules").select("run_count").eq("id", id).single();
      await sb.from("automation_rules").update({ run_count: ((data?.run_count as number) ?? 0) + 1 }).eq("id", id);
    },

    async jobEnqueue(j) {
      const runAfter = new Date(Date.now() + (j.delaySeconds ?? 0) * 1000).toISOString();
      const { error } = await sb.from("jobs").insert({
        id: genId("job"), idempotency_key: j.idempotency_key, type: j.type, payload: j.payload,
        status: "queued", attempts: 0, max_attempts: 5, run_after: runAfter, created_at: nowIso(),
      });
      if (error) {
        if (String(error.message).toLowerCase().includes("duplicate")) return "dup";
        throw new Error(error.message);
      }
      return "created";
    },
    async jobsDue(limit) {
      return (must(await sb.from("jobs").select("*").eq("status", "queued").lte("run_after", nowIso()).order("run_after").limit(limit)) as Job[]) ?? [];
    },
    async jobsRecent(limit) {
      return (must(await sb.from("jobs").select("*").order("created_at", { ascending: false }).limit(limit)) as Job[]) ?? [];
    },
    async jobsRecoverStuck(olderThanMinutes) {
      const cutoff = new Date(Date.now() - olderThanMinutes * 60000).toISOString();
      const { data } = await sb.from("jobs").update({ status: "queued", run_after: nowIso() })
        .eq("status", "processing").lt("created_at", cutoff).select("id");
      return data?.length ?? 0;
    },
    async jobsForceDue() {
      const { data } = await sb.from("jobs").update({ run_after: nowIso() })
        .eq("status", "queued").gt("run_after", nowIso()).select("id");
      return data?.length ?? 0;
    },
    async jobRequeue(id) {
      must(await sb.from("jobs").update({ status: "queued", run_after: nowIso() }).eq("id", id).neq("status", "done"));
    },
    async jobGet(id) {
      const { data } = await sb.from("jobs").select("*").eq("id", id).maybeSingle();
      return (data as Job) ?? null;
    },
    async jobClaim(id) {
      // قفل تفاؤلي: لا ينجح إلا لو كانت المهمة ما زالت queued
      const { data } = await sb.from("jobs").update({ status: "processing" }).eq("id", id).eq("status", "queued").select("id");
      return (data?.length ?? 0) > 0;
    },
    async jobDone(id) { must(await sb.from("jobs").update({ status: "done", processed_at: nowIso() }).eq("id", id)); },
    async jobFail(id, err, retryAtIso) {
      const { data } = await sb.from("jobs").select("attempts").eq("id", id).single();
      const attempts = ((data?.attempts as number) ?? 0) + 1;
      if (retryAtIso) {
        must(await sb.from("jobs").update({ status: "queued", attempts, run_after: retryAtIso, last_error: err }).eq("id", id));
      } else {
        must(await sb.from("jobs").update({ status: "dead", attempts, last_error: err, processed_at: nowIso() }).eq("id", id));
      }
    },

    async templateList() { return (must(await sb.from("email_templates").select("*").order("name")))!; },
    async templateGet(id) {
      const { data } = await sb.from("email_templates").select("*").eq("id", id).maybeSingle();
      return data ?? null;
    },
    async templateUpsert(t) {
      const blocks = t.blocks === undefined ? undefined : t.blocks ?? null;
      if (t.id) {
        const patch: Record<string, unknown> = { name: t.name, subject: t.subject, body_html: t.body_html, updated_at: nowIso() };
        if (blocks !== undefined) patch.blocks = blocks;
        const { data } = await sb.from("email_templates")
          .update(patch).eq("id", t.id).select().single();
        return data!;
      }
      const { data } = await sb.from("email_templates")
        .insert({ id: genId("tmpl"), name: t.name, subject: t.subject, body_html: t.body_html, blocks: blocks ?? null, created_at: nowIso(), updated_at: nowIso() }).select().single();
      return data!;
    },
    async templateDelete(id) { must(await sb.from("email_templates").delete().eq("id", id)); },

    async emailLogAdd(e) {
      const row = { id: e.id ?? genId("eml"), created_at: nowIso(), ...e };
      const { data } = await sb.from("email_log").insert({ ...row, id: row.id }).select().single();
      return data as EmailLog;
    },
    async emailLogSetProvider(id, provider, msgId, status, error = null) {
      must(await sb.from("email_log").update({ provider, provider_msg_id: msgId, status, error }).eq("id", id));
    },
    async emailLogSetStatusByMsg(msgId, status, error = null) {
      await sb.from("email_log").update({ status, error }).eq("provider_msg_id", msgId);
    },
    async emailLogList(page = 1, pageSize = 20, ticketId) {
      let q = sb.from("email_log").select("*", { count: "exact" });
      if (ticketId) q = q.eq("ticket_id", ticketId);
      q = q.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
      const res = await q;
      return { rows: (must(res) as EmailLog[]) ?? [], total: res.count ?? 0 };
    },

    async notifyAdd(n) {
      must(await sb.from("notifications").insert({ id: genId("ntf"), ...n, read_at: null, created_at: nowIso() }));
    },
    async notificationsList(staffId) {
      return (must(await sb.from("notifications").select("*").eq("staff_id", staffId).order("created_at", { ascending: false }).limit(50)))!;
    },
    async notificationsUnread(staffId) {
      const { count } = await sb.from("notifications").select("id", { count: "exact", head: true }).eq("staff_id", staffId).is("read_at", null);
      return count ?? 0;
    },
    async notificationsMarkRead(staffId) {
      await sb.from("notifications").update({ read_at: nowIso() }).eq("staff_id", staffId).is("read_at", null);
    },

    async attachmentAdd(a) {
      const row = { ...a, created_at: nowIso() };
      const { data } = await sb.from("attachments").insert(row).select().single();
      return data!;
    },
    async attachmentList(ticketId) {
      return (must(await sb.from("attachments").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: false })))!;
    },
    async attachmentGet(id) {
      const { data } = await sb.from("attachments").select("*").eq("id", id).maybeSingle();
      return data ?? null;
    },
  };
}
