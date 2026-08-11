"use client";

import { useState } from "react";
import type { FormFieldCfg } from "@/lib/types";
import { saveFormFieldsAction } from "@/app/actions/admin";

const SCOPE_HINT: Record<string, string> = {
  client: "قائمة منسدلة + كتابة حرة",
  client_contact: "بريد مدخل البيانات — العميل نفسه لا يحتاج بريداً",
  request_type: "تطوير جديد / تعديل سابق / مشكلة",
  title: "عنوان مختصر يظهر في الجدول والإيميل",
  details: "تفاصيل وخطوات طويلة",
  creator: "هوية مقدم الطلب",
  tester: "إجباري لمراجعة اكتمال الطلب",
  developer: "اختياري في البداية",
  attachment: "إجباري حسب سياسة النموذج",
};

export function FormDesigner({ initial }: { initial: FormFieldCfg[] }) {
  const [fields, setFields] = useState<FormFieldCfg[]>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (from === to) return;
    setFields((old) => { const n = [...old]; const [item] = n.splice(from, 1); n.splice(to, 0, item); return n; });
  };

  const update = (key: string, patch: Partial<FormFieldCfg>) =>
    setFields((fs) => fs.map((f) => {
      if (f.key !== key) return f;
      const next = { ...f, ...patch };
      if (!next.visible) next.required = false; // المخفي لا يكون إجبارياً
      return next;
    }));

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        تحكم في الحقول الظاهرة والإجبارية في <b>نموذج إنشاء الطلب الداخلي</b> و<b>نموذج الضيوف العام</b> — بدون كود.
      </p>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="w-16 px-3 py-2 text-center font-bold">الترتيب</th>
              <th className="px-3 py-2 text-right font-bold">الحقل</th>
              <th className="px-3 py-2 text-center font-bold">ظاهر</th>
              <th className="px-3 py-2 text-center font-bold">إجباري</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr
                key={f.key} draggable
                onDragStart={() => setDragIndex(i)} onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragIndex !== null) move(dragIndex, i); setDragIndex(null); }} onDragEnd={() => setDragIndex(null)}
                className={`border-t border-slate-100 ${dragIndex === i ? "opacity-50" : ""}`}
              >
                <td className="cursor-grab px-3 py-2 text-center text-slate-400">⋮⋮ <b className="text-xs">{i + 1}</b></td>
                <td className="px-3 py-2">
                  <b>{f.label}</b>
                  <span className="mr-2 text-xs text-slate-400">{SCOPE_HINT[f.key]}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  <input type="checkbox" checked={f.visible} onChange={(e) => update(f.key, { visible: e.target.checked })} className="h-4 w-4 accent-blue-600" />
                </td>
                <td className="px-3 py-2 text-center">
                  <input type="checkbox" checked={f.required} disabled={!f.visible} onChange={(e) => update(f.key, { required: e.target.checked })} className="h-4 w-4 accent-blue-600 disabled:opacity-30" />
                </td>
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
          await saveFormFieldsAction(fields);
          setSaving(false);
          setMsg("تم حفظ تصميم النماذج ✓ — ساري فوراً على النموذج الداخلي والعام");
        }}
        className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "جارٍ الحفظ…" : "حفظ تصميم النماذج ✓"}
      </button>
    </div>
  );
}
