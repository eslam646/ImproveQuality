"use client";

import { useState } from "react";
import { clientDeleteAction, clientSaveAction, clientSetActiveAction } from "@/app/actions/admin";

export interface ClientRow { id: string; name: string; contact_email: string | null; active: boolean }

const inputCls = "rounded-lg border border-slate-300 px-3 py-2 text-sm";

export function ClientsManager({ clients, isAdmin }: { clients: ClientRow[]; isAdmin: boolean }) {
  const [rows, setRows] = useState(clients);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => { setEditId(null); setName(""); setEmail(""); setErr(null); };

  const save = async () => {
    setBusy(true); setErr(null);
    const r = await clientSaveAction({ id: editId ?? undefined, name, contact_email: email });
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "تعذر الحفظ"); return; }
    if (editId) {
      setRows((rs) => rs.map((x) => x.id === editId ? { ...x, name: name.trim(), contact_email: email.trim() || null } : x));
    } else {
      setRows((rs) => [...rs, { id: r.id!, name: name.trim(), contact_email: email.trim() || null, active: true }]);
    }
    reset();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        هذه القائمة تظهر كقائمة منسدلة في نموذج إنشاء الطلب الداخلي ونموذج الضيوف العام.
        العميل الذي له بريد مسجل يصله إشعار <b>طلب جديد</b> تلقائياً.
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم العميل / الشركة *" className={`${inputCls} min-w-48 flex-1`} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="بريد العميل (اختياري)" dir="ltr" className={`${inputCls} min-w-48 flex-1`} />
        <button onClick={save} disabled={busy || name.trim().length < 2} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? "…" : editId ? "حفظ التعديل ✓" : "+ إضافة عميل"}
        </button>
        {editId && <button onClick={reset} className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold">إلغاء</button>}
      </div>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p>}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-right font-bold">العميل</th>
              <th className="px-3 py-2 text-right font-bold">البريد</th>
              <th className="px-3 py-2 text-center font-bold">نشط</th>
              <th className="px-3 py-2 text-center font-bold">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-semibold">{c.name}</td>
                <td className="px-3 py-2 text-slate-500" dir="ltr">{c.contact_email ?? "—"}</td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox" checked={c.active}
                    onChange={async (e) => {
                      setRows((rs) => rs.map((x) => x.id === c.id ? { ...x, active: e.target.checked } : x));
                      await clientSetActiveAction(c.id, e.target.checked ? 1 : 0);
                    }}
                    className="h-4 w-4 accent-blue-600"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => { setEditId(c.id); setName(c.name); setEmail(c.contact_email ?? ""); }} className="ml-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200">تعديل</button>
                  {isAdmin && (
                    <button
                      onClick={async () => {
                        if (!confirm(`حذف العميل «${c.name}»؟`)) return;
                        setRows((rs) => rs.filter((x) => x.id !== c.id));
                        await clientDeleteAction(c.id);
                      }}
                      className="rounded-md bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100"
                    >حذف</button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">لا عملاء بعد — أضف أول عميل بالأعلى</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
