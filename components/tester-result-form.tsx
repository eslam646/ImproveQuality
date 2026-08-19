"use client";

import { useState } from "react";
import { testerResultAction } from "@/app/actions/tickets";

// نتيجة الاختبار: «ابدأ الاختبار» يبدأ عدّاد تقدير التيست — ثم الاعتماد أو الفشل بسبب إجباري
export function TesterResultForm({ code, status = "ready_for_test" }: { code: string; status?: string }) {
  const [failMode, setFailMode] = useState(false);

  // جاهز للاختبار → أول خطوة إجبارية: بدء الاختبار (يبدأ العدّاد)
  if (status === "ready_for_test") {
    return (
      <form action={testerResultAction} className="mt-3">
        <input type="hidden" name="code" value={code} />
        <button name="result" value="testing" className="w-full rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-bold text-white hover:bg-fuchsia-700">
          🧪 ابدأ الاختبار — يبدأ عدّاد تقدير التيست
        </button>
      </form>
    );
  }

  if (failMode) {
    return (
      <form action={testerResultAction} className="mt-3 space-y-2">
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="result" value="test_failed" />
        <textarea
          name="note" required minLength={3} rows={3} autoFocus
          placeholder="اكتب سبب فشل الاختبار / وصف المشكلة — يُرسل للمطوّر إجبارياً ليعمل عليها مجدداً…"
          className="w-full rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm placeholder:text-rose-400"
        />
        <div className="flex gap-2">
          <button type="submit" className="flex-1 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700">
            تأكيد الفشل وإبلاغ المطوّر ⚠️
          </button>
          <button type="button" onClick={() => setFailMode(false)} className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-300">
            رجوع
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-3 flex gap-2">
      <form action={testerResultAction} className="flex-1">
        <input type="hidden" name="code" value={code} />
        <button name="result" value="test_passed" className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700">
          ✓ اجتاز الاختبار
        </button>
      </form>
      <button onClick={() => setFailMode(true)} className="flex-1 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700">
        ✗ فشل الاختبار
      </button>
    </div>
  );
}
