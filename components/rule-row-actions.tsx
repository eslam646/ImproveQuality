"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteRuleAction, toggleRuleAction } from "@/app/actions/rules";

export function RuleRowActions({ id, enabled }: { id: string; enabled: number }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2 text-xs">
      <Link href={`/automation/editor?id=${id}`} className="rounded-lg bg-slate-200 px-3 py-1.5 font-bold hover:bg-slate-300">تحرير</Link>
      <button
        className="rounded-lg bg-slate-200 px-3 py-1.5 font-bold hover:bg-slate-300"
        onClick={async () => { await toggleRuleAction(id, enabled ? 0 : 1); router.refresh(); }}
      >
        {enabled ? "إيقاف" : "تفعيل"}
      </button>
      <button
        className="rounded-lg bg-rose-100 px-3 py-1.5 font-bold text-rose-700 hover:bg-rose-200"
        onClick={async () => {
          if (confirm("حذف هذه القاعدة نهائياً؟")) { await deleteRuleAction(id); router.refresh(); }
        }}
      >
        حذف
      </button>
    </div>
  );
}
