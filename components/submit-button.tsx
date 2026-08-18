"use client";

import { useFormStatus } from "react-dom";
import { cx } from "@/lib/util";

// زر إرسال ذكي: يقفل نفسه فور الضغط ويعرض «جارٍ الإرسال…» حتى ينتهي الـServer Action —
// يمنع الضغط المتكرر الذي كان يُنشئ طلبات مكررة عندما يستغرق الإرسال ثواني على الإنتاج
export function SubmitButton({
  children,
  pendingText = "⏳ جارٍ الإرسال… لا تضغط مرة أخرى",
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-slate-200 text-slate-800 hover:bg-slate-300",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
  } as const;
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cx(
        "rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        styles[variant],
        className,
      )}
    >
      {pending ? pendingText : children}
    </button>
  );
}
