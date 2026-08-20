"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setPinAction, toggleStaffAction, upsertStaffAction } from "@/app/actions/admin";
import type { Role } from "@/lib/types";

interface StaffRow {
  id: string; name: string; email: string; role: Role; role_label: string;
  manager_id: string | null; active: boolean; specializations?: string[] | null;
}

const inputCls = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm";

export function StaffManager({ staff, specializations = [] }: { staff: StaffRow[]; specializations?: { key: string; label: string }[] }) {
  const router = useRouter();
  const [form, setForm] = useState<{ id: string | null; name: string; email: string; role: Role; manager_id: string; specializations: string[] }>
    ({ id: null, name: "", email: "", role: "developer", manager_id: "", specializations: [] });
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* نموذج إضافة/تحرير */}
      <form
        className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await upsertStaffAction({
            ...(form.id ? { id: form.id } : {}),
            name: form.name, email: form.email, role: form.role, manager_id: form.manager_id,
            specializations: form.role === "developer" ? form.specializations : [],
          });
          if (r.ok) { setForm({ id: null, name: "", email: "", role: "developer", manager_id: "", specializations: [] }); setError(null); router.refresh(); }
          else setError(r.error ?? "خطأ");
        }}
      >
        <input required className={inputCls} placeholder="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input required type="email" className={inputCls} placeholder="البريد" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          <option value="admin">مدير النظام</option>
          <option value="support">مدخل بيانات / دعم</option>
          <option value="developer">مطور</option>
          <option value="tester">فريق الاختبار</option>
        </select>
        <select className={inputCls} value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })}>
          <option value="">— مديره المباشر —</option>
          {staff.filter((s) => s.id !== form.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {form.role === "developer" && specializations.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2">
            <span className="text-xs font-bold text-indigo-700">تخصصاته:</span>
            {specializations.map((sp) => (
              <label key={sp.key} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={form.specializations.includes(sp.key)}
                  onChange={(e) => setForm({ ...form, specializations: e.target.checked ? [...form.specializations, sp.key] : form.specializations.filter((k) => k !== sp.key) })}
                />
                {sp.label}
              </label>
            ))}
            <span className="text-[11px] text-slate-400">بدون تحديد = يظهر في كل قوائم التخصصات</span>
          </div>
        )}
        <button className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-blue-700">
          {form.id ? "تحديث ✓" : "+ إضافة"}
        </button>
        {form.id && (
          <button type="button" className="rounded-lg bg-slate-300 px-3 py-1.5 text-sm" onClick={() => setForm({ id: null, name: "", email: "", role: "developer", manager_id: "", specializations: [] })}>إلغاء</button>
        )}
        {error && <span className="text-sm font-bold text-rose-600">{error}</span>}
      </form>

      {/* الجدول */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-right text-xs text-slate-500">
            <th className="py-2">الاسم</th><th>البريد</th><th>الدور</th><th>المدير المباشر</th><th>الحالة</th><th></th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id} className="border-b border-slate-100">
              <td className="py-2.5 font-bold">{s.name}</td>
              <td className="text-slate-600" dir="ltr">{s.email}</td>
              <td>{s.role_label}{s.role === "developer" && s.specializations?.length ? <span className="block text-[11px] text-indigo-600">{s.specializations.map((k) => specializations.find((x) => x.key === k)?.label ?? k).join("، ")}</span> : null}</td>
              <td className="text-slate-600">{staff.find((m) => m.id === s.manager_id)?.name ?? "—"}</td>
              <td>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}>
                  {s.active ? "نشط" : "موقوف"}
                </span>
              </td>
              <td className="flex gap-2 py-2 text-xs">
                <button className="rounded-lg bg-slate-200 px-3 py-1 font-bold hover:bg-slate-300"
                  onClick={() => setForm({ id: s.id, name: s.name, email: s.email, role: s.role, manager_id: s.manager_id ?? "", specializations: s.specializations ?? [] })}>
                  تحرير
                </button>
                <button className="rounded-lg bg-amber-100 px-3 py-1 font-bold text-amber-800 hover:bg-amber-200"
                  title="ضبط رقم سري لدخول الإنتاج"
                  onClick={async () => {
                    const pin = prompt(`الرقم السري الجديد لـ ${s.name} (4 أرقام فأكثر):`, "");
                    if (!pin) return;
                    const r = await setPinAction(s.id, pin);
                    if (r.ok) alert(`✅ تم ضبط الرقم السري لـ ${s.name} — قوله له بعيد عن الشاشات 🤐`);
                    else alert(`❌ ${r.error}`);
                  }}>
                  🔑 PIN
                </button>
                <button className="rounded-lg bg-slate-200 px-3 py-1 font-bold hover:bg-slate-300"
                  onClick={async () => { await toggleStaffAction(s.id, s.active ? 0 : 1); router.refresh(); }}>
                  {s.active ? "إيقاف" : "تفعيل"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
