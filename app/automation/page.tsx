import Link from "next/link";
import { requirePerm, requireStaff } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { Badge, Card } from "@/components/ui";
import { RuleRowActions } from "@/components/rule-row-actions";
import type { TriggerType } from "@/lib/types";

export const dynamic = "force-dynamic";

const TRIGGER_LABELS: Record<TriggerType, string> = {
  "ticket.created": "🆕 عند إنشاء طلب",
  "tester.assigned": "🧪 عند تكليف التيستر",
  "ticket.assigned": "👤 عند تعيين مطور",
  "tester.accepted": "✅ قبول التيستر",
  "tester.declined": "❌ رفض التيستر",
  "developer.accepted": "✅ قبول المطور",
  "developer.declined": "❌ رفض المطور",
  "urgent.withdrawal": "🙅 اعتذار عن الدعم الفوري",
  "urgent.progress": "🚨 موقف الدعم الفوري",
  "ticket.rejected": "❌ رفض الطلب نهائياً",
  "test.failed": "🧪 فشل الاختبار",
  "ticket.delivered": "📦 الإصلاح / التسليم",
  "note.added": "💬 ملاحظة جديدة",
  "field.changed": "🔄 عند تغيير حقل",
  "schedule.stale": "⏰ مجدول (تذكير بالمتوقفة)",
};

export default async function AutomationPage() {
  await requirePerm("automation");
  const repo = await getRepo();
  const rules = await repo.rulesList();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">مركز الأتمتة</h1>
          <p className="text-sm text-slate-500">قواعد «متى ← ماذا» مثل Lark تماماً — بلا حدود على عدد القواعد أو التنفيذات</p>
        </div>
        <Link href="/automation/editor" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
          + قاعدة جديدة
        </Link>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-right text-xs text-slate-500">
              <th className="py-2">القاعدة</th>
              <th>المشغّل</th>
              <th>شروط</th>
              <th>إجراءات</th>
              <th>مرات التنفيذ</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-3 font-bold">{r.name}</td>
                <td>
                  {TRIGGER_LABELS[r.trigger_type]}
                  {r.trigger_type === "field.changed" && r.trigger_field && (
                    <span className="mr-1 text-xs text-slate-400">({r.trigger_field === "dev_status" ? "حالة التطوير" : r.trigger_field})</span>
                  )}
                </td>
                <td className="text-xs text-slate-500">{r.conditions.length ? `${r.conditions.length} شرط` : "—"}</td>
                <td className="text-xs text-slate-500">
                  {r.actions.map((a, i) => (
                    <div key={i}>{a.type === "send_email" ? "📧 إرسال إيميل" : a.type === "notify" ? "🔔 إشعار داخلي" : "✏️ تحديث حقل"}</div>
                  ))}
                </td>
                <td><Badge color="bg-slate-100 text-slate-700">{r.run_count}</Badge></td>
                <td>
                  <Badge color={r.enabled ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}>
                    {r.enabled ? "مفعّلة" : "موقوفة"}
                  </Badge>
                </td>
                <td><RuleRowActions id={r.id} enabled={r.enabled} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-slate-400">
        التنفيذ يتم عبر طابور مهام مضمون (Idempotent + إعادة محاولة تلقائية ×5) — راجع «سجل البريد» لمتابعة كل رسالة.
      </p>
    </div>
  );
}
