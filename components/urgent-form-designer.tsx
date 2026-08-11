"use client";

import { useState } from "react";
import type { UrgentFormFieldCfg } from "@/lib/types";
import { saveUrgentFormFieldsAction } from "@/app/actions/admin";

export function UrgentFormDesigner({ initial }: { initial: UrgentFormFieldCfg[] }) {
  const [fields, setFields] = useState(initial);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const update = (i: number, patch: Partial<UrgentFormFieldCfg>) => setFields((old) => old.map((f, j) => j === i ? { ...f, ...patch } : f));
  const move = (from: number, to: number) => {
    if (from === to) return;
    setFields((old) => { const n = [...old]; const [item] = n.splice(from, 1); n.splice(to, 0, item); return n; });
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">اسحب الحقول من علامة <b>⋮⋮</b> لتغيير ترتيبها. الحقول المقفلة ضرورية لدورة الدعم الفوري ويمكن ترتيبها لكن لا يمكن إخفاؤها.</p>
      <div className="space-y-2">
        {fields.map((f, i) => (
          <div
            key={f.key} draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIndex !== null) move(dragIndex, i); setDragIndex(null); }}
            onDragEnd={() => setDragIndex(null)}
            className={`flex items-center gap-3 rounded-lg border bg-white px-3 py-2 ${dragIndex === i ? "opacity-50" : ""}`}
          >
            <span className="cursor-grab select-none text-xl text-slate-400" title="اسحب لتغيير الترتيب">⋮⋮</span>
            <span className="w-7 rounded-full bg-slate-100 py-1 text-center text-xs font-bold">{i + 1}</span>
            <input value={f.label} onChange={(e) => update(i, { label: e.target.value })} className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm font-semibold" />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.visible} disabled={f.locked} onChange={(e) => update(i, { visible: e.target.checked, required: e.target.checked ? f.required : false })} /> ظاهر</label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.required} disabled={f.locked || !f.visible} onChange={(e) => update(i, { required: e.target.checked })} /> إجباري</label>
            {f.locked && <span title="حقل جوهري" className="text-xs">🔒</span>}
          </div>
        ))}
      </div>
      {msg && <p className="rounded-lg bg-emerald-50 p-2 text-sm font-bold text-emerald-700">{msg}</p>}
      <button disabled={saving} onClick={async () => { setSaving(true); setMsg(null); await saveUrgentFormFieldsAction(fields); setSaving(false); setMsg("تم حفظ ترتيب وتصميم نموذج الدعم الفوري ✓"); }} className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
        {saving ? "جارٍ الحفظ…" : "حفظ تصميم الدعم الفوري ✓"}
      </button>
    </div>
  );
}
