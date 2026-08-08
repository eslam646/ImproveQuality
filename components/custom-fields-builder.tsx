"use client";

import { useState } from "react";
import type { CustomFieldCfg, CustomFieldType } from "@/lib/types";
import { saveCustomFieldsAction } from "@/app/actions/admin";

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "نص قصير",
  textarea: "نص طويل",
  number: "رقم",
  select: "قائمة منسدلة",
  date: "تاريخ",
  file: "ملف مرفق 📎",
};

const inputCls = "rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm";

export function CustomFieldsBuilder({ initial }: { initial: CustomFieldCfg[] }) {
  const [fields, setFields] = useState<CustomFieldCfg[]>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const add = () =>
    setFields((fs) => [
      ...fs,
      { key: `cf_${Date.now().toString(36)}`, label: "", type: "text", required: false, internal: true, guest: true },
    ]);
  const update = (key: string, patch: Partial<CustomFieldCfg>) =>
    setFields((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  const move = (i: number, dir: -1 | 1) =>
    setFields((fs) => {
      const j = i + dir;
      if (j < 0 || j >= fs.length) return fs;
      const copy = [...fs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const remove = (key: string) => setFields((fs) => fs.filter((f) => f.key !== key));

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        أضف حقولك الخاصة بلا كود: تظهر في نموذج إنشاء الطلب و/أو نموذج الضيوف، وتُحفظ مع التذكرة وتظهر في صفحتها. رتّبها بالأسهم.
      </p>

      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={f.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex gap-1">
                <button title="أعلى" onClick={() => move(i, -1)} className="rounded bg-white px-2 py-1 text-xs shadow-sm hover:bg-slate-100">▲</button>
                <button title="أسفل" onClick={() => move(i, 1)} className="rounded bg-white px-2 py-1 text-xs shadow-sm hover:bg-slate-100">▼</button>
              </span>
              <input
                value={f.label}
                onChange={(e) => update(f.key, { label: e.target.value })}
                placeholder="اسم الحقل — مثال: هاتف العميل *"
                className={`${inputCls} min-w-44 flex-1`}
              />
              <select
                value={f.type}
                onChange={(e) => update(f.key, { type: e.target.value as CustomFieldType })}
                className={inputCls}
              >
                {(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
              <button onClick={() => remove(f.key)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100">حذف</button>
            </div>
            {f.type === "select" && (
              <input
                value={(f.options ?? []).join("، ")}
                onChange={(e) => update(f.key, { options: e.target.value.split(/[,،]/) })}
                placeholder="خيارات القائمة مفصولة بفاصلة — مثال: عاجل، متوسط، عادي"
                className={`${inputCls} mt-2 w-full`}
              />
            )}
            <div className="mt-2 flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={f.required} onChange={(e) => update(f.key, { required: e.target.checked })} className="h-3.5 w-3.5 accent-blue-600" />
                إجباري
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={f.internal} onChange={(e) => update(f.key, { internal: e.target.checked })} className="h-3.5 w-3.5 accent-blue-600" />
                يظهر في النموذج الداخلي
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={f.guest} onChange={(e) => update(f.key, { guest: e.target.checked })} className="h-3.5 w-3.5 accent-blue-600" />
                يظهر في نموذج الضيوف
              </label>
            </div>
          </div>
        ))}
        {fields.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
            لا حقول مخصصة بعد — اضغط «+ حقل جديد» لإضافة أول حقل (مثلاً: هاتف العميل، الأولوية، قسم المشكلة…)
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={add} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">+ حقل جديد</button>
        <button
          disabled={saving}
          onClick={async () => {
            setSaving(true); setMsg(null);
            const r = await saveCustomFieldsAction(fields);
            setSaving(false);
            setMsg(r.ok ? `تم الحفظ ✓ — ${r.count} حقل نشط` : `خطأ: ${r.error}`);
          }}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "جارٍ الحفظ…" : "حفظ الحقول المخصصة ✓"}
        </button>
      </div>
      {msg && <p className={`rounded-lg px-3 py-2 text-sm font-bold ${msg.startsWith("خطأ") ? "bg-rose-50 text-rose-700" : "bg-green-50 text-green-700"}`}>{msg}</p>}
    </div>
  );
}
