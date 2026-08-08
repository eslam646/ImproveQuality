"use client";

import { useState } from "react";
import type { PermKey, Role, RolePermissions } from "@/lib/types";
import { PERM_LABELS } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/labels";
import { saveRolePermissionsAction } from "@/app/actions/admin";

const ROLES: Role[] = ["admin", "support", "developer", "tester"];
const PERMS = Object.keys(PERM_LABELS) as PermKey[];

export function RolePermissionsEditor({ initial }: { initial: RolePermissions }) {
  const [perms, setPerms] = useState<RolePermissions>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = (role: Role, perm: PermKey) => {
    if (role === "admin" && perm === "settings") return; // لا قفل للنظام
    setPerms((p) => ({ ...p, [role]: { ...p[role], [perm]: !p[role][perm] } }));
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        حدّد ما يظهر لكل دور وما يستطيع فتحه — الأزرار تختفي من الشريط والصفحة نفسها تُحجب. (صلاحية «إعدادات النظام» للمدير ثابتة حمايةً من قفل النظام)
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-right font-bold">الصفحة / الميزة</th>
              {ROLES.map((r) => <th key={r} className="px-3 py-2 text-center font-bold">{ROLE_LABELS[r]}</th>)}
            </tr>
          </thead>
          <tbody>
            {PERMS.map((perm) => (
              <tr key={perm} className="border-t border-slate-100">
                <td className="px-3 py-2 font-semibold">{PERM_LABELS[perm]}</td>
                {ROLES.map((role) => {
                  const locked = role === "admin" && perm === "settings";
                  return (
                    <td key={role} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={locked ? true : perms[role]?.[perm] ?? false}
                        disabled={locked}
                        onChange={() => toggle(role, perm)}
                        className="h-4 w-4 accent-blue-600 disabled:opacity-40"
                        title={locked ? "محمية دائماً" : `${ROLE_LABELS[role]} — ${PERM_LABELS[perm]}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-bold text-green-700">{msg}</p>}
      <button
        disabled={saving}
        onClick={async () => {
          setSaving(true); setMsg(null);
          await saveRolePermissionsAction(perms);
          setSaving(false);
          setMsg("تم حفظ الصلاحيات ✓ — سارية فوراً على كل الأدوار");
        }}
        className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "جارٍ الحفظ…" : "حفظ مصفوفة الصلاحيات ✓"}
      </button>
    </div>
  );
}
