"use client";

import { useState } from "react";
import type { TrackPageCfg, TrackPageFieldKey } from "@/lib/types";
import { saveTrackCfgAction } from "@/app/actions/admin";

const LABELS: Record<TrackPageFieldKey, { label: string; hint: string }> = {
  show_estimation: { label: "تقدير وقت التنفيذ", hint: "الأيام/الساعات المقدرة للطلب" },
  show_timeline: { label: "مسار الحالة", hint: "خط زمني بكل تغييرات الحالة" },
  show_last_change: { label: "تاريخ آخر تحديث", hint: "متى تغيّرت الحالة آخر مرة" },
  show_client: { label: "اسم العميل", hint: "الجهة صاحبة المشروع" },
  show_title: { label: "عنوان الطلب / المشكلة", hint: "العنوان المختصر للتذكرة" },
  show_request_type: { label: "نوع الطلب", hint: "تطوير جديد / تعديل سابق / مشكلة" },
  show_ticket_kind: { label: "عادي أم دعم فوري", hint: "تمييز طلبات التدخل الطارئ" },
  show_priority: { label: "الأولوية", hint: "عادية / مرتفعة / حرجة" },
  show_creator: { label: "مدخل البيانات", hint: "صاحب الطلب" },
  show_tester: { label: "التيستر المسند", hint: "مسؤول مراجعة واختبار الطلب" },
  show_developer: { label: "المطور المسند", hint: "من يعمل على الطلب حالياً" },
  show_assignment_status: { label: "حالة قبول التيستر والمطور", hint: "بانتظار الرد / مقبول / مرفوض" },
  show_affected_service: { label: "الخدمة المتأثرة", hint: "السيرفر أو قاعدة البيانات في الدعم الفوري" },
  show_custom: { label: "الحقول المخصصة", hint: "قيم الحقول التي أنشأها المدير" },
};

export function TrackCfgEditor({ initial }: { initial: TrackPageCfg }) {
  const allKeys = Object.keys(LABELS) as TrackPageFieldKey[];
  const initialOrder = [...(initial.order ?? []), ...allKeys.filter((k) => !(initial.order ?? []).includes(k))];
  const [cfg, setCfg] = useState<TrackPageCfg>({ ...initial, order: initialOrder });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        هذه الصفحة قراءة فقط وآمنة: الكود نفسه هو المفتاح (لا تسريب لبيانات التواصل إطلاقاً). اختر ما يظهر فيها:
      </p>
      <div className="space-y-2">
        {(cfg.order ?? initialOrder).map((k, i) => (
          <label
            key={k} draggable onDragStart={() => setDragIndex(i)} onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIndex !== null && dragIndex !== i) { const n = [...(cfg.order ?? initialOrder)]; const [x] = n.splice(dragIndex, 1); n.splice(i, 0, x); setCfg((c) => ({ ...c, order: n })); } setDragIndex(null); }}
            onDragEnd={() => setDragIndex(null)}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 ${dragIndex === i ? "opacity-50" : ""}`}
          >
            <span className="cursor-grab text-lg text-slate-400">⋮⋮</span>
            <span className="w-6 text-center text-xs font-bold text-slate-400">{i + 1}</span>
            <input type="checkbox" checked={cfg[k]} onChange={() => setCfg((c) => ({ ...c, [k]: !c[k] }))} className="h-4 w-4 accent-blue-600" />
            <span className="flex-1"><b className="text-sm">{LABELS[k].label}</b><span className="mr-2 text-xs text-slate-400">{LABELS[k].hint}</span></span>
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
