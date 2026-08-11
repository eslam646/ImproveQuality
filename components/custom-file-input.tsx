"use client";

import { useState } from "react";
import type { CustomFieldCfg } from "@/lib/types";

// حقل مخصص من نوع «ملف مرفق»: يرفع فور اختيار الملف إلى /api/public/upload
// ويضع النتيجة «اسم|رابط» في حقل خفي يُرسل مع النموذج (داخلي أو ضيوف)
export function CustomFileInput({ f }: { f: CustomFieldCfg }) {
  const [state, setState] = useState<"idle" | "uploading" | "done" | "fail">("idle");
  const [value, setValue] = useState(""); // "name|url"
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  return (
    <div className="space-y-1.5">
      <input type="hidden" name={`cf_${f.key}`} value={value} />
      <input
        type="file"
        required={f.required && state !== "done"}
        accept="image/*,video/mp4,video/quicktime,video/webm,.mkv,.pdf,.txt,.log,.zip,.doc,.docx,.xls,.xlsx"
        className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm file:ml-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-blue-700"
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
          } catch (e) {
            setState("fail"); setValue(""); setError(e instanceof Error ? e.message : "تعذر الرفع");
          }
        }}
      />
      {state === "uploading" && <p className="text-xs font-semibold text-blue-600">⏳ جارٍ رفع {fileName}…</p>}
      {state === "done" && <p className="text-xs font-semibold text-green-700">✅ تم رفع «{fileName}» وجاهز للإرسال</p>}
      {state === "fail" && <p className="text-xs font-semibold text-rose-600">⚠️ تعذر رفع {fileName ? `«${fileName}» ` : ""}— {error || "صور وفيديو وPDF وOffice وZIP حتى 50MB"}</p>}
    </div>
  );
}
