"use client";

import { useEffect } from "react";

// نبّاض الطابور: بعد تحميل أي صفحة داخلية يدق /api/worker/tick بهدوء —
// طلب مستقل بميزانية Cloudflare كاملة يرسل أي بريد منتظر خلال ثوانٍ من أي حدث.
// لو فيه بقية يدق مرة أخرى (حتى 5 دقات) ثم يتوقف. صامت تماماً ولا يؤثر على الواجهة.
export function QueuePinger() {
  useEffect(() => {
    let cancelled = false;
    let rounds = 0;
    const tick = async () => {
      if (cancelled || rounds >= 5) return;
      rounds++;
      try {
        const res = await fetch("/api/worker/tick", { method: "POST" });
        if (!res.ok) return;
        const j = (await res.json()) as { remaining?: boolean };
        if (j.remaining && !cancelled) setTimeout(tick, 2000);
      } catch { /* صامت — الدورة المجدولة شبكة الأمان */ }
    };
    const t = setTimeout(tick, 800); // بعد استقرار الصفحة
    return () => { cancelled = true; clearTimeout(t); };
  }, []);
  return null;
}
