"use client";

import { useState } from "react";
import { generateLoginLinkAction, revokePrivateAccessLinkAction } from "@/app/actions/admin";

// روابط الدخول الشخصية: الموظف يفتح الرابط فيدخل النظام بهويته فوراً — بدون PIN
// مدير النظام مستثنى (بالرقم السري فقط)، وأي رابط قابل للإلغاء الفوري
export function LoginLinksManager({
  staff,
  links,
}: {
  staff: { id: string; name: string; email: string; role_label: string }[];
  links: { id: string; staff_id: string; active: boolean; created_at: string; last_used_at: string | null }[];
}) {
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const names = Object.fromEntries(staff.map((r) => [r.id, r.name]));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
        ⚠️ الرابط = دخول كامل بهوية صاحبه (بصلاحيات دوره). أرسله عبر قناة خاصة آمنة فقط، ولو تسرب ألغِه فوراً من الجدول.
        كل دخول بالرابط يُسجل في سجل التدقيق. <b>مدير النظام لا يُصدر له رابط — بالرقم السري فقط.</b>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-64 flex-1">
          <span className="mb-1 block text-sm font-bold">الموظف</span>
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {staff.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.role_label}</option>)}
          </select>
        </label>
        <button
          disabled={!staffId || busy}
          onClick={async () => {
            setBusy(true); setError(null); setGeneratedUrl(null); setCopied(false);
            const r = await generateLoginLinkAction(staffId);
            setBusy(false);
            if (r.ok && r.url) setGeneratedUrl(r.url);
            else setError(r.error ?? "تعذر إنشاء الرابط");
          }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "جارٍ الإنشاء…" : "🔗 إنشاء رابط دخول شخصي"}
        </button>
      </div>

      {generatedUrl && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="mb-2 text-sm font-bold text-emerald-800">انسخ الرابط الآن — لن يظهر كاملًا مرة أخرى:</p>
          <div className="flex gap-2">
            <input readOnly dir="ltr" value={generatedUrl} className="min-w-0 flex-1 rounded border bg-white px-2 py-1.5 text-xs" />
            <button
              onClick={() => { navigator.clipboard.writeText(generatedUrl); setCopied(true); }}
              className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white"
            >
              {copied ? "✓ نُسخ" : "نسخ"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="rounded-lg bg-rose-50 p-2 text-sm font-bold text-rose-700">{error}</p>}

      {links.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-right"><tr><th className="p-2">الموظف</th><th className="p-2">الإنشاء</th><th className="p-2">آخر دخول</th><th className="p-2">الحالة</th><th className="p-2"></th></tr></thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2 font-semibold">{names[l.staff_id] ?? l.staff_id}</td>
                  <td className="p-2 text-xs text-slate-500">{new Date(l.created_at).toLocaleString("ar-EG")}</td>
                  <td className="p-2 text-xs text-slate-500">{l.last_used_at ? new Date(l.last_used_at).toLocaleString("ar-EG") : "لم يُستخدم بعد"}</td>
                  <td className="p-2">{l.active ? <span className="font-bold text-emerald-600">فعّال</span> : <span className="text-slate-400">ملغي</span>}</td>
                  <td className="p-2">
                    {l.active && (
                      <button
                        onClick={async () => { await revokePrivateAccessLinkAction(l.id); location.reload(); }}
                        className="rounded bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700 hover:bg-rose-200"
                      >
                        إلغاء فوري
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
