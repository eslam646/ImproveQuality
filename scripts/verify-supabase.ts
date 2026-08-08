/* اختبار شامل على Supabase الحقيقي — يعمل مرة واحدة ثم ينظف بيانات الاختبار */
import { getRepo } from "../lib/db";
import { createTicketOp, changeStatusOp } from "../lib/ops";
import { processAll } from "../lib/worker";

const mark = (ok: boolean, label: string) => console.log(`${ok ? "✅" : "❌"} ${label}`);

async function main() {
  const repo = await getRepo();

  // 1) البذور
  const staff = await repo.staffList();
  mark(staff.length >= 6, `الموظفون المزروعون: ${staff.length}`);
  const clients = await repo.clientsList(true);
  mark(clients.length >= 4, `العملاء: ${clients.map((c) => c.name).join(" / ")}`);
  const templates = await repo.templateList();
  mark(templates.length >= 4, `القوالب: ${templates.length}`);
  const rules = await repo.rulesEnabled();
  mark(rules.length >= 4, `القواعد المفعّلة: ${rules.length}`);
  const settings = await repo.settingsGet();
  mark(settings.form_fields.length === 6, `مصمم النماذج: ${settings.form_fields.length} حقول`);

  // 2) دورة حياة تذكرة كاملة
  const t = await createTicketOp({
    client_name: "اختبار النشر (سيتم مسحها)", client_contact: "client1@example.com",
    details: "تذكرة اختبار للتأكد من دورة الأتمتة كاملة على Supabase الحقيقي",
    developer_id: "st-ahmed",
    actor: { staff_id: "st-sara", label: "سارة (فحص النشر)" },
    source: "internal",
  });
  mark(!!t.code, `إنشاء تذكرة: ${t.code} مع إسناد مطور`);

  await changeStatusOp(t.id, "in_progress", "أحمد سمير", "بدأ العمل عليها");

  const report = await processAll();
  mark(report.processed >= 2, `العامل عالج ${report.processed} مهمة (إيميل+إشعار طلب جديد وتعيين وتحديث حالة)`);

  const logs = await repo.emailLogList(1, 20, t.id);
  const tos = logs.rows.map((l) => l.to_addr);
  mark(logs.total >= 3, `إيميلات مسجلة للتذكرة: ${logs.total} → ${tos.join(" | ")}`);
  const bodyOk = logs.rows[0]?.body_html.includes("تتبع حالة الطلب") ?? logs.rows.some((l) => l.body_html.includes("تتبع"));
  mark(bodyOk, "جسم الإيميل مبني بالأقسام التلقائية (أزرار/جدول)");

  const notifs = await repo.notificationsList("st-ahmed");
  mark(notifs.length >= 1, `إشعار داخلي وصل للمطور: ${notifs[0]?.message ?? ""}`);

  const events = await repo.eventList(t.id);
  mark(events.length >= 3, `سجل الأحداث: ${events.map((e) => e.type).join(" ← ")}`);

  // 3) تنظيف بيانات الاختبار
  {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    await sb.from("email_log").delete().eq("ticket_id", t.id);
    await sb.from("notifications").delete().eq("ticket_id", t.id);
    await sb.from("events").delete().eq("ticket_id", t.id);
    await sb.from("jobs").delete().like("idempotency_key", `%${t.id}%`);
    await sb.from("tickets").delete().eq("id", t.id);
    console.log("🧹 تم مسح بيانات الاختبار — النظام جاهز للتسليم");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error("❌", e); process.exit(1); });
