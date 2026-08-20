"use client";

import { useState } from "react";
import type { DevSpecialization } from "@/lib/types";
import { saveSpecializationsAction } from "@/app/actions/admin";

// تخصصات التطوير (باك/فرونت/UX...) — قائمة ديناميكية يتحكم بها الأدمن بلا كود
export function SpecializationsEditor({ initial }: { initial: DevSpecialization[] }) {
  const [items, setItems] = useState<DevSpecialization[]>(initial);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        تُستخدم عند إسناد أكثر من مطوّر على نفس التاسك (باك/فرونت/UX…) — كل تخصص له شخص وتقدير وعدّاد مستقل، والتاسك لا تصبح «جاهز للاختبار» إلا بعد جاهزية الجميع.
      </p>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={it.key} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
            <input
              value={it.label}
              onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={it.active} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} />
              فعّال
            </label>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
          placeholder="تخصص جديد (مثال: Mobile / DevOps)…"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={() => {
            const label = newLabel.trim();
            if (label.length < 2) return;
            const key = `spec_${Date.now().toString(36)}`;
            setItems([...items, { key, label, active: true }]);
            setNewLabel("");
          }}
          className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-bold hover:bg-slate-300"
        >
          + إضافة
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          disabled={saving}
          onClick={async () => {
            setSaving(true); setMsg(null);
            const r = await saveSpecializationsAction(items);
            setSaving(false);
            setMsg(r.ok ? "تم الحفظ ✓" : r.error ?? "تعذر الحفظ");
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "جارٍ الحفظ…" : "حفظ التخصصات ✓"}
        </button>
        {msg && <span className="text-sm font-semibold text-emerald-600">{msg}</span>}
      </div>
    </div>
  );
}
