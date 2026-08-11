"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AttachmentUpload({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const input = (e.target as HTMLFormElement).elements.namedItem("file") as HTMLInputElement;
        if (!input.files?.length) return;
        setBusy(true); setMsg(null);
        const fd = new FormData();
        fd.set("code", code);
        fd.set("file", input.files[0]);
        const res = await fetch("/api/attachments/upload", { method: "POST", body: fd });
        const j = await res.json();
        setBusy(false);
        setMsg(res.ok ? "تم الرفع ✓" : j.error || "فشل الرفع");
        if (res.ok) { input.value = ""; router.refresh(); }
      }}
    >
      <div>
        <input type="file" name="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.log" className="text-xs file:ml-2 file:rounded-lg file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-xs file:font-semibold hover:file:bg-slate-300" />
        <div className="mt-1 text-[10px] text-slate-400">صور، فيديو MP4/MOV/WEBM، PDF، Office، ZIP وLogs — حتى 50MB حاليًا</div>
      </div>
      <button disabled={busy} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-600 disabled:opacity-50">
        {busy ? "…" : "رفع"}
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </form>
  );
}
