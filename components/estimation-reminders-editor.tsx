"use client";

import { useState } from "react";
import type { EstimationReminderCfg } from "@/lib/types";
import { saveEstimationRemindersAction } from "@/app/actions/admin";

const inputCls = "w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm";

// تحكم كامل في تذكيرات التقدير الزمني للديف والتيست — بدون كود
export function EstimationRemindersEditor({ initial }: { initial: EstimationReminderCfg }) {
  const [cfg, setCfg] = useState<EstimationReminderCfg>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const Toggle = ({ k, label, hint }: { k: keyof EstimationReminderCfg; label: string; hint: string }) => (
    <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <input
        type="checkbox"
        className="mt-1"
        checked={!!cfg[k]}
        onChange={(e) => setCfg({ ...cfg, [k]: e.target.checked })}
      />
      <span className="text-sm">
        <b>{label}</b>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        عدّاد الديف يبدأ عند «قيد التطوير» وعدّاد التيست يبدأ عند «جاري الاختبار» — كل تذكير يُرسل مرة واحدة تلقائياً.
      </p>

      <Toggle k="enabled" label="تفعيل تذكيرات التقدير الزمني" hint="إيقافها يوقف كل التذكيرات أدناه" />

      <div className={cfg.enabled ? "space-y-3" : "pointer-events-none space-y-3 opacity-40"}>
        <Toggle k="halfway" label="تذكير عند منتصف المهلة" hint="مثال: التقدير يومان → تذكير بعد يوم" />

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <input
            type="checkbox"
            checked={cfg.before_end}
            onChange={(e) => setCfg({ ...cfg, before_end: e.target.checked })}
          />
          <span className="text-sm font-bold">تذكير قبل نهاية المهلة بـ</span>
          <input
            type="number" min={1} max={72} className={inputCls} value={cfg.before_end_hours}
            onChange={(e) => setCfg({ ...cfg, before_end_hours: parseInt(e.target.value || "2", 10) || 2 })}
          />
          <span className="text-sm">ساعة</span>
        </div>

        <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={cfg.overdue}
              onChange={(e) => setCfg({ ...cfg, overdue: e.target.checked })}
            />
            إيميل «التاسك متأخرة عندك» عند تجاوز التقدير
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>تكرار التذكير كل</span>
            <input
              type="number" min={0} max={168} className={inputCls} value={cfg.overdue_repeat_hours}
              onChange={(e) => setCfg({ ...cfg, overdue_repeat_hours: parseInt(e.target.value || "0", 10) || 0 })}
            />
            <span>ساعة <span className="text-xs text-slate-500">(0 = مرة واحدة فقط)</span></span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cfg.cc_admins}
              onChange={(e) => setCfg({ ...cfg, cc_admins: e.target.checked })}
            />
            نسخة للإدارة في إيميلات التأخير
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <span className="font-bold">حساب «اليوم» في التقدير =</span>
          <input
            type="number" min={1} max={24} className={inputCls} value={cfg.day_hours}
            onChange={(e) => setCfg({ ...cfg, day_hours: parseInt(e.target.value || "8", 10) || 8 })}
          />
          <span>ساعة <span className="text-xs text-slate-500">(8 = يوم عمل، 24 = يوم كامل)</span></span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled={saving}
          onClick={async () => {
            setSaving(true); setMsg(null);
            const r = await saveEstimationRemindersAction(cfg);
            setSaving(false);
            setMsg(r.ok ? "تم الحفظ ✓" : "تعذر الحفظ");
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "جارٍ الحفظ…" : "حفظ إعدادات التذكيرات ✓"}
        </button>
        {msg && <span className="text-sm font-semibold text-emerald-600">{msg}</span>}
      </div>
    </div>
  );
}
