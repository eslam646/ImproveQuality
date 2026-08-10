"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resendEmailToRecipientsAction } from "@/app/actions/admin";

export function ForwardEmailButton({
  id,
  staff,
}: {
  id: string;
  staff: { id: string; name: string; email: string; roleLabel: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [manual, setManual] = useState("");
  const [cc, setCc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const split = (v: string) => v.split(/[;,\s]+/).map((x) => x.trim()).filter(Boolean);
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-200">
        👥 إرسال لأشخاص محددين
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 text-right shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">إعادة إرسال لأشخاص محددين</h2>
              <button onClick={() => setOpen(false)} className="text-xl text-slate-400">×</button>
            </div>
            <p className="mb-3 text-sm text-slate-500">اختر موظفًا أو أكثر، ويمكن إضافة بريد يدوي. سيُسجّل من أعاد الإرسال ولمن.</p>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
              {staff.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selected.includes(s.email)}
                    onChange={(e) => setSelected((old) => e.target.checked ? [...old, s.email] : old.filter((x) => x !== s.email))}
                    className="h-4 w-4 accent-blue-600"
                  />
                  <span className="flex-1 text-sm"><b>{s.name}</b> <span className="text-xs text-slate-400">{s.roleLabel}</span></span>
                  <span className="text-xs text-slate-500" dir="ltr">{s.email}</span>
                </label>
              ))}
            </div>
            <label className="mt-3 block text-sm font-bold">عناوين إضافية في To</label>
            <input value={manual} onChange={(e) => setManual(e.target.value)} dir="ltr" placeholder="a@x.com; b@x.com" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            <label className="mt-3 block text-sm font-bold">CC اختياري</label>
            <input value={cc} onChange={(e) => setCc(e.target.value)} dir="ltr" placeholder="manager@x.com" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            {error && <p className="mt-3 rounded-lg bg-rose-50 p-2 text-sm font-bold text-rose-700">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold">إلغاء</button>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true); setError(null);
                  const r = await resendEmailToRecipientsAction(id, [...selected, ...split(manual)], split(cc));
                  setBusy(false);
                  if (!r.ok) setError(r.error ?? "تعذر الإرسال");
                  else { setOpen(false); router.refresh(); }
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >{busy ? "جارٍ الإرسال…" : "إرسال الآن"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
