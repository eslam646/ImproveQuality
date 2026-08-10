"use client";

import { useState } from "react";
import { generatePrivateAccessLinkAction, revokePrivateAccessLinkAction } from "@/app/actions/admin";

export function PrivateLinksManager({
  requesters,
  links,
}: {
  requesters: { id: string; name: string; email: string }[];
  links: { id: string; staff_id: string; active: boolean; created_at: string; last_used_at: string | null }[];
}) {
  const [staffId, setStaffId] = useState(requesters[0]?.id ?? "");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = Object.fromEntries(requesters.map((r) => [r.id, r.name]));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        الرابط يحدد هوية مدخل البيانات تلقائيًا. يظهر كاملًا مرة واحدة فقط عند الإنشاء؛ خزّنه وأرسله للشخص المقصود عبر قناة آمنة.
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-64 flex-1">
          <span className="mb-1 block text-sm font-bold">مدخل البيانات</span>
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {requesters.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.email}</option>)}
          </select>
        </label>
        <button
          disabled={!staffId || busy}
          onClick={async () => {
            setBusy(true); setError(null); setGeneratedUrl(null);
            const r = await generatePrivateAccessLinkAction(staffId);
            setBusy(false);
            if (r.ok && r.url) setGeneratedUrl(r.url);
            else setError(r.error ?? "تعذر إنشاء الرابط");
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "جارٍ الإنشاء…" : "إنشاء رابط خاص جديد"}
        </button>
      </div>

      {generatedUrl && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="mb-2 text-sm font-bold text-emerald-800">انسخ الرابط الآن — لن يظهر كاملًا مرة أخرى:</p>
          <div className="flex gap-2">
            <input readOnly dir="ltr" value={generatedUrl} className="min-w-0 flex-1 rounded border bg-white px-2 py-1.5 text-xs" />
            <button onClick={() => navigator.clipboard.writeText(generatedUrl)} className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white">نسخ</button>
          </div>
        </div>
      )}
      {error && <p className="rounded-lg bg-rose-50 p-2 text-sm font-bold text-rose-700">{error}</p>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-right"><tr><th className="p-2">مدخل البيانات</th><th className="p-2">الإنشاء</th><th className="p-2">آخر استخدام</th><th className="p-2">الحالة</th><th className="p-2"></th></tr></thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-2 font-semibold">{names[l.staff_id] ?? l.staff_id}</td>
                <td className="p-2 text-xs text-slate-500">{new Date(l.created_at).toLocaleString("ar-EG")}</td>
                <td className="p-2 text-xs text-slate-500">{l.last_used_at ? new Date(l.last_used_at).toLocaleString("ar-EG") : "لم يُستخدم"}</td>
                <td className="p-2">{l.active ? "✅ نشط" : "⛔ ملغي"}</td>
                <td className="p-2">
                  {l.active && <button onClick={async () => { await revokePrivateAccessLinkAction(l.id); location.reload(); }} className="text-xs font-bold text-rose-700">إلغاء الرابط</button>}
                </td>
              </tr>
            ))}
            {!links.length && <tr><td colSpan={5} className="p-4 text-center text-slate-400">لا توجد روابط خاصة بعد</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
