"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { resendEmailAction } from "@/app/actions/admin";

export function ResendButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        disabled={busy}
        className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold hover:bg-slate-300 disabled:opacity-50"
        onClick={async () => {
          setBusy(true); setMsg(null);
          const r = await resendEmailAction(id);
          setBusy(false);
          setMsg(r.ok ? "أُعيد الإرسال ✓" : r.error ?? "فشل");
          router.refresh();
        }}
      >
        {busy ? "…" : "🔁 إعادة إرسال"}
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </span>
  );
}
