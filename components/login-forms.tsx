"use client";

import { ROLE_LABELS } from "@/lib/labels";
import type { Role } from "@/lib/types";
import { useState } from "react";

// روابط GET بسيطة بدون كوكيز وبدون جافاسكربت إلزامي — تعمل داخل iframe المعاينة وخارجه
export function StaffLoginButtons({ staff }: { staff: { id: string; name: string; role: Role }[] }) {
  return (
    <div className="space-y-2">
      {staff.map((s) => (
        <a
          key={s.id}
          href={`/api/auth/login-as?staff_id=${s.id}`}
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-2.5 text-right hover:bg-blue-50 hover:border-blue-300 transition"
        >
          <span className="font-semibold">{s.name}</span>
          <span className="text-xs text-slate-500">{ROLE_LABELS[s.role]}</span>
        </a>
      ))}
      <p className="pt-2 text-center text-xs text-slate-400">
        تجربة سريعة: <a className="font-bold text-blue-700 hover:underline" href="/dashboard">تخطَّ إلى لوحة التحكم مباشرة</a>
      </p>
    </div>
  );
}

// دخول الإنتاج: اختيار الاسم + الرقم السري
export function PinLoginForm({ staff }: { staff: { id: string; name: string; role: Role }[] }) {
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setErr(null);
        const res = await fetch("/api/auth/pin-login", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ staff_id: staffId, pin }),
        });
        const j = await res.json();
        setBusy(false);
        if (res.ok) window.location.assign("/dashboard");
        else setErr(j.error || "تعذر الدخول");
      }}
    >
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">الاسم</span>
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name} — {ROLE_LABELS[s.role]}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">الرقم السري (PIN)</span>
        <input
          type="password" inputMode="numeric" required minLength={4}
          value={pin} onChange={(e) => setPin(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest" placeholder="••••"
        />
      </label>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{err}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
        {busy ? "جارٍ الدخول…" : "دخول ←"}
      </button>
      <p className="text-center text-xs text-slate-400">الرقم السري يضبطه المدير من شاشة «الموظفون». الجلسة تدوم 30 يوماً.</p>
    </form>
  );
}

export function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null); setErr(null);
        const res = await fetch("/api/auth/magic-link", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const j = await res.json();
        if (res.ok) setMsg("تم إرسال رابط الدخول إلى بريدك ✓");
        else setErr(j.error || "تعذر الإرسال");
      }}
    >
      <input
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        type="email" required placeholder="بريدك المسجل في النظام"
        value={email} onChange={(e) => setEmail(e.target.value)}
      />
      <button className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
        أرسل رابط الدخول
      </button>
      {msg && <p className="text-sm font-semibold text-green-600">{msg}</p>}
      {err && <p className="text-sm font-semibold text-rose-600">{err}</p>}
    </form>
  );
}
