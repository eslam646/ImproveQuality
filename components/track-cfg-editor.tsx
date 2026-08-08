"use client";

import { useState } from "react";
import type { TrackPageCfg } from "@/lib/types";
import { saveTrackCfgAction } from "@/app/actions/admin";

const LABELS: Record<keyof TrackPageCfg, { label: string; hint: string }> = {
  show_estimation: { label: "تقدير وقت التنفيذ", hint: "الأيام/الساعات المقدرة للطلب" },
  show_timeline: { label: "مسار الحالة", hint: "خط زمني بكل تغييرات الحالة" },
  show_last_change: { label: "تاريخ آخر تحديث", hint: "متى تغيّرت الحالة آخر مرة" },
  show_client: { label: "اسم العميل", hint: "يُعرض في صندوق النتيجة" },
  show_developer: { label: "اسم المطور المسند", hint: "من يعمل على الطلب حالياً" },
  show_custom: { label: "الحقول المخصصة", hint: "قيم حقول منشئ الحقول (مثل هاتف العميل)" },
};

export function TrackCfgEditor({ initial }: { initial: TrackPageCfg }) {
  const [cfg, setCfg] = useState<TrackPageCfg>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        هذه الصفحة قراءة فقط وآمنة: الكود نفسه هو المفتاح (لا تسريب لبيانات التواصل إطلاقاً). اختر ما يظهر فيها:
      </p>
      <div className="space-y-2">
        {(Object.keys(LABELS) as (keyof TrackPageCfg)[]).map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <input type="checkbox" checked={cfg[k]} onChange={() => setCfg((c) => ({ ...c, [k]: !c[k] }))} className="h-4 w-4 accent-blue-600" />
            <span className="flex-1">
              <b className="text-sm">{LABELS[k].label}</b>
              <span className="mr-2 text-xs text-slate-400">{LABELS[k].hint}</span>
            </span>
            <span className={`text-xs font-bold ${cfg[k] ? "text-green-600" : "text-slate-300"}`}>{cfg[k] ? "يظهر" : "مخفي"}</span>
          </label>
        ))}
      </div>
      {msg && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-bold text-green-700">{msg}</p>}
      <button
        disabled={saving}
        onClick={async () => {
          setSaving(true); setMsg(null);
          await saveTrackCfgAction(cfg);
          setSaving(false);
          setMsg("تم حفظ إعدادات صفحة الاستعلام ✓");
        }}
        className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "جارٍ الحفظ…" : "حفظ ✓"}
      </button>
    </div>
  );
}
