"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateSettingsAction } from "@/app/actions/admin";
import type { Settings } from "@/lib/types";

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        const r = await updateSettingsAction(v);
        setBusy(false);
        if (r.ok) { router.push("/settings?ok=1"); router.refresh(); }
        else setError(r.error ?? "خطأ");
      }}
    >
      <label className="block">
        <span className="mb-1 block text-sm font-bold">اسم النظام</span>
        <input className={inputCls} value={v.app_name} onChange={(e) => setV({ ...v, app_name: e.target.value })} />
      </label>

      <label className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
        <input type="checkbox" className="mt-1" checked={v.allow_guest_submit}
          onChange={(e) => setV({ ...v, allow_guest_submit: e.target.checked })} />
        <span className="text-sm">
          <b>السماح بتقديم التذاكر بدون تسجيل دخول</b> (اختياري — بيدك أنت 🔑)
          <span className="block text-xs text-slate-500">
            عند التفعيل يعمل النموذج العام <span dir="ltr">/submit</span> لأي زائر، ويُنشأ طلب مصدره «نموذج عام» وتُطلق أتمتة «طلب جديد».
          </span>
        </span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-bold">اسم المُرسل في الإيميلات</span>
          <input className={inputCls} value={v.sender_name} onChange={(e) => setV({ ...v, sender_name: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">بريد المُرسل (دومينك المؤكَّد)</span>
          <input className={inputCls} dir="ltr" placeholder="support@yourdomain.com" value={v.sender_email} onChange={(e) => setV({ ...v, sender_email: e.target.value })} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-bold">مهلة التذكير بالتذاكر المتوقفة (ساعة)</span>
          <input type="number" min={1} className={inputCls} value={v.stale_hours}
            onChange={(e) => setV({ ...v, stale_hours: parseInt(e.target.value || "24", 10) || 24 })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">رابط النظام الأساسي (للروابط داخل الإيميل)</span>
          <input className={inputCls} dir="ltr" value={v.base_url} onChange={(e) => setV({ ...v, base_url: e.target.value })} />
        </label>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
      <button disabled={busy} className="rounded-lg bg-blue-600 px-6 py-2.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50">
        {busy ? "…" : "حفظ الإعدادات ✓"}
      </button>
    </form>
  );
}
