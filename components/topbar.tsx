import Link from "next/link";
import { currentStaff, permissionsOf } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import type { PermKey } from "@/lib/types";
import { LogoutButton } from "./logout-button";

export async function Topbar() {
  const staff = await currentStaff();
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  const unread = staff ? await repo.notificationsUnread(staff.id) : 0;
  const demoMode = process.env.AUTH_MODE !== "supabase" && process.env.AUTH_MODE !== "pin";
  const allStaff = demoMode ? await repo.staffList(true) : [];
  const switcher = (["admin", "support", "developer", "tester"] as const)
    .map((role) => ({ role, person: allStaff.find((s) => s.role === role) }))
    .filter((x) => x.person);
  const perms = staff ? await permissionsOf(staff.role) : null;

  const links = [
    { href: "/dashboard", label: "التذاكر", perm: "dashboard" as PermKey },
    { href: "/tickets/new", label: "+ طلب جديد", perm: "new_ticket" as PermKey },
    { href: "/testing", label: "واجهة الاختبار", perm: "testing" as PermKey },
    { href: "/automation", label: "الأتمتة", perm: "automation" as PermKey },
    { href: "/templates", label: "القوالب", perm: "templates" as PermKey },
    { href: "/staff", label: "الموظفون", perm: "staff" as PermKey },
    { href: "/emails", label: "سجل البريد", perm: "emails" as PermKey },
    { href: "/settings", label: "الإعدادات", perm: "settings" as PermKey },
  ].map((l) => ({ ...l, show: perms ? (perms[l.perm] ?? (staff?.role === "admin" && l.perm === "settings") ) : false }));

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900 text-white">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/dashboard" className="text-lg font-extrabold tracking-tight">
          {settings.app_name}
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
          {links.filter((l) => l.show).map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-1.5 text-slate-200 hover:bg-slate-800">
              {l.label}
            </Link>
          ))}
        </nav>
        {staff ? (
          <div className="flex items-center gap-3 text-sm">
            <Link href="/notifications" className="relative rounded-lg px-2 py-1 hover:bg-slate-800" title="الإشعارات">
              🔔
              {unread > 0 && (
                <span className="absolute -left-1 -top-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold">{unread}</span>
              )}
            </Link>
            <span className="text-slate-300">{staff.name}</span>
            {demoMode ? (
              <Link href="/login" className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600">تبديل</Link>
            ) : (
              <LogoutButton />
            )}
          </div>
        ) : (
          <Link href="/login" className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold hover:bg-blue-500">دخول</Link>
        )}
      </div>
      {demoMode && staff && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 bg-indigo-950/60 px-4 py-2 text-xs">
          <span className="font-bold text-indigo-200">🎭 وضع تجريبي — بدّل الدور بنقرة:</span>
          {switcher.map(({ role, person }) => (
            <a
              key={role}
              href={`/api/auth/login-as?staff_id=${person!.id}`}
              className={`rounded-full px-3 py-1 font-bold transition ${
                staff.id === person!.id ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
              }`}
            >
              {{ admin: "مدير", support: "دعم", developer: "مطور (قراءة فقط)", tester: "تيستر" }[role]}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
