"use client";

import { useState } from "react";

// مرفق الدعم الفوري: يرفع فور الاختيار إلى /api/public/upload ويضع «اسم|رابط» في حقل خفي
// الإظهار والإلزام يتحكم بهما الأدمن من «تصميم نموذج الدعم الفوري» في الإعدادات
export function UrgentAttachmentInput({ required }: { required: boolean }) {
  const [state, setState] = useState<"idle" | "uploading" | "done" | "fail">("idle");
  const [value, setValue] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  return (
    <div className="space-y-1.5">
      <input type="hidden" name="attachment_ref" value={value} />
      <input
        type="file"
        required={required && state !== "done"}
        accept="image/*,video/mp4,video/quicktime,video/webm,.mkv,.pdf,.txt,.log,.zip,.doc,.docx,.xls,.xlsx"
        className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm file:ml-3 file:rounded-md file:border-0 file:bg-rose-50 file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-rose-700"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) { setState("idle"); setValue(""); setFileName(""); setError(""); return; }
          if (file.size > 50 * 1024 * 1024) { setState("fail"); setValue(""); setFileName(file.name); setError("الحد الأقصى الحالي 50 ميجابايت"); return; }
          setState("uploading"); setFileName(file.name); setError("");
          try {
            const fd = new FormData();
            fd.set("file", file);
            const res = await fetch("/api/public/upload", { method: "POST", body: fd });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || "تعذر الرفع");
            setValue(`${file.name}|${j.url}`);
            setState("done");
          } catch (err) {
            setState("fail"); setValue(""); setError(err instanceof Error ? err.message : "تعذر الرفع");
          }
        }}
      />
      {state === "uploading" && <p className="text-xs font-semibold text-blue-600">⏳ جارٍ رفع {fileName}…</p>}
      {state === "done" && <p className="text-xs font-semibold text-green-700">✅ تم رفع «{fileName}» وسيُرفق بالطلب</p>}
      {state === "fail" && <p className="text-xs font-semibold text-rose-600">⚠️ تعذر رفع {fileName ? `«${fileName}» ` : ""}— {error || "صور وفيديو وPDF وOffice وZIP حتى 50MB"}</p>}
    </div>
  );
}
