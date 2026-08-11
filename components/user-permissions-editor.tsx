"use client";

import { useMemo, useState } from "react";
import type { PermKey, Role, RolePermissions, UserPermissionOverrides } from "@/lib/types";
import { PERM_LABELS } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/labels";
import { saveUserPermissionsAction } from "@/app/actions/admin";

export function UserPermissionsEditor({ staff, rolePermissions, initial }: {
  staff: { id: string; name: string; email: string; role: Role }[];
  rolePermissions: RolePermissions;
  initial: UserPermissionOverrides;
}) {
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [overrides, setOverrides] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const person = staff.find((s) => s.id === staffId);
  const keys = Object.keys(PERM_LABELS) as PermKey[];
  const current = overrides[staffId] ?? {};
  const setValue = (key: PermKey, value: "inherit" | "allow" | "deny") => {
    setOverrides((all) => {
      const user = { ...(all[staffId] ?? {}) };
      if (value === "inherit") delete user[key]; else user[key] = value === "allow";
      const next = { ...all };
      if (Object.keys(user).length) next[staffId] = user; else delete next[staffId];
      return next;
    });
  };
  const counts = useMemo(() => ({ allow: Object.values(current).filter((v) => v === true).length, deny: Object.values(current).filter((v) => v === false).length }), [current]);

  return <div className="space-y-4">
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
      كل شخص يرث صلاحيات دوره. اختر «سماح خاص» أو «منع خاص» لتجاوز دوره لهذا الشخص فقط؛ واختر «يرث الدور» لإلغاء الاستثناء.
    </div>
    <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
      {staff.map((s) => <option key={s.id} value={s.id}>{s.name} — {ROLE_LABELS[s.role]} — {s.email}</option>)}
    </select>
    {person && <div className="flex gap-2 text-xs"><span className="rounded-full bg-slate-100 px-3 py-1">الدور: {ROLE_LABELS[person.role]}</span><span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">سماح خاص: {counts.allow}</span><span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">منع خاص: {counts.deny}</span></div>}
    <div className="max-h-[520px] overflow-auto rounded-lg border">
      <table className="w-full text-sm"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-2 text-right">الصلاحية</th><th className="p-2">الدور</th><th className="p-2">استثناء الشخص</th><th className="p-2">النتيجة</th></tr></thead>
        <tbody>{person && keys.map((k) => {
          const inherited = rolePermissions[person.role]?.[k] ?? false;
          const explicit = current[k];
          const effective = explicit ?? inherited;
          return <tr key={k} className="border-t"><td className="p-2 font-semibold">{PERM_LABELS[k]}</td><td className="p-2 text-center">{inherited ? "✅" : "❌"}</td><td className="p-2 text-center"><select value={explicit === undefined ? "inherit" : explicit ? "allow" : "deny"} onChange={(e) => setValue(k, e.target.value as "inherit" | "allow" | "deny")} className="rounded border px-2 py-1 text-xs"><option value="inherit">يرث الدور</option><option value="allow">✅ سماح خاص</option><option value="deny">❌ منع خاص</option></select></td><td className={`p-2 text-center font-bold ${effective ? "text-emerald-600" : "text-rose-600"}`}>{effective ? "مسموح" : "ممنوع"}</td></tr>;
        })}</tbody>
      </table>
    </div>
    {msg && <p className="rounded-lg bg-emerald-50 p-2 text-sm font-bold text-emerald-700">{msg}</p>}
    <button disabled={saving} onClick={async () => { setSaving(true); setMsg(null); await saveUserPermissionsAction(overrides); setSaving(false); setMsg("تم حفظ الاستثناءات الفردية وتطبيقها فورًا ✓"); }} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "جارٍ الحفظ…" : "حفظ صلاحيات الأشخاص ✓"}</button>
  </div>;
}
