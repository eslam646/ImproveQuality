// المصادقة والصلاحيات — أوضاع: demo (تجربة بدون كوكيز) | pin (إنتاج: رقم سري لكل موظف) | supabase (ماجيك لينك)
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRepo } from "./db";
import type { PermKey, Role, Staff } from "./types";
import { DEFAULT_ROLE_PERMISSIONS } from "./types";

export const AUTH_COOKIE = "support_sid";

export function pinHash(pin: string): string {
  return crypto.createHash("sha256").update(`support-hub-pin:${pin}`).digest("hex");
}

export async function currentStaff(): Promise<Staff | null> {
  const repo = await getRepo();

  // وضع الإنتاج PIN: كوكي جلسة آمن — كل موظف برقمه السري
  if (process.env.AUTH_MODE === "pin") {
    const cookieStore = await cookies();
    const sid = cookieStore.get(AUTH_COOKIE)?.value;
    if (!sid) return null;
    const s = await repo.staffGet(sid);
    return s && s.active ? s : null;
  }

  if (process.env.AUTH_MODE === "supabase") {
    try {
      const { createServerClient } = await import("@supabase/ssr");
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          cookies: {
            getAll() { return cookieStore.getAll(); },
            setAll(cs: { name: string; value: string; options?: unknown }[]) {
              try {
                cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options as never));
              } catch { /* من داخل RSC — يُحدَّث عبر route handlers */ }
            },
          },
        },
      );
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      if (!email) return null;
      return await repo.staffByEmail(email);
    } catch {
      return null;
    }
  }

  // وضع العرض التجريبي بدون كوكيز إطلاقاً:
  // الهوية تُحفظ في خادم قاعدة البيانات (demo_current_staff) لأن المعاينة داخل iframe تمنع الكوكيز.
  const sidSetting = await repo.settingsValueGet("demo_current_staff");
  if (sidSetting) {
    const s = await repo.staffGet(sidSetting);
    if (s && s.active) return s;
  }
  // توافق خلفي: كوكي قديم إن وجد
  const cookieStore = await cookies();
  const sidCookie = cookieStore.get(AUTH_COOKIE)?.value;
  if (sidCookie) {
    const s = await repo.staffGet(sidCookie);
    if (s && s.active) return s;
  }
  // افتراضي: أول مدير نشط حتى يعمل النظام فوراً بدون خطوة دخول
  const all = await repo.staffList(true);
  return all.find((s) => s.role === "admin") ?? all[0] ?? null;
}

export async function requireStaff(roles?: Role[]): Promise<Staff> {
  const s = await currentStaff();
  if (!s) redirect("/login");
  if (roles && !roles.includes(s.role)) redirect("/dashboard");
  return s;
}

// صلاحيات دور معيّن من إعدادات الأدمن (مع الافتراضي عند عدم التخصيص)
export async function permissionsOf(role: Role): Promise<Record<PermKey, boolean>> {
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  return settings.role_permissions[role] ?? DEFAULT_ROLE_PERMISSIONS[role];
}

// حارس الصفحات بالصلاحيات — الإعدادات نفسها محمية دائماً للمدير تفادياً لقفل النظام
export async function requirePerm(key: PermKey): Promise<Staff> {
  const s = await currentStaff();
  if (!s) redirect("/login");
  const perms = await permissionsOf(s.role);
  const allowAlways = s.role === "admin" && key === "settings";
  if (!perms[key] && !allowAlways) redirect("/dashboard?denied=" + key);
  return s;
}

export const isAdmin = (s: Staff | null) => s?.role === "admin";
export const canManage = (s: Staff | null) => s?.role === "admin" || s?.role === "support";
