import { z } from "zod";
import { ALL_STATUSES } from "./labels";

export const createTicketSchema = z.object({
  client_name: z.string().trim().min(2, "اسم العميل مطلوب (حرفان على الأقل)").max(120),
  client_contact: z.string().trim().max(160).optional().or(z.literal("")),
  details: z.string().trim().min(5, "اكتب تفاصيل كافية للطلب").max(4000),
  developer_id: z.string().optional().or(z.literal("")),
});

export const guestSubmitSchema = z.object({
  client_name: z.string().trim().min(2).max(120),
  client_contact: z.string().trim().max(160).optional().or(z.literal("")),
  details: z.string().trim().min(5).max(4000),
});

export const publicUpdateSchema = z.object({
  code: z.string().trim().min(6, "كود الطلب غير صحيح").max(40),
  dev_status: z.enum(ALL_STATUSES as [string, ...string[]]),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const staffSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email("بريد غير صالح"),
  role: z.enum(["admin", "support", "developer", "tester"]),
  manager_id: z.string().optional().or(z.literal("")),
  specializations: z.array(z.string().max(40)).max(20).optional(),
});

export const templateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  subject: z.string().trim().min(2).max(300),
  body_html: z.string().max(20000).default(""), // نص تمهيدي اختياري — الأقسام التلقائية تحمل المحتوى
});

export const settingsSchema = z.object({
  app_name: z.string().trim().min(2).max(100),
  allow_guest_submit: z.boolean(),
  sender_name: z.string().trim().min(2).max(100),
  sender_email: z.string().trim().email().or(z.literal("")),
  stale_hours: z.number().int().min(1).max(24 * 30),
  base_url: z.string().trim().url().or(z.literal("")),
});
