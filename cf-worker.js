// غلاف الووركر: يضيف مشغّل الجدولة (Cron) فوق ووركر OpenNext المولّد —
// كل دقيقتين يستدعي /api/worker «داخلياً» (بدون شبكة — Cloudflare يمنع الووركر من مناداة دومينه)
// فيرسل بريد الطابور ويطلق تذكيرات التقدير حتى لو لا أحد فاتح النظام:
// نبضة المتصفح تغطي وقت الاستخدام، والكرون يغطي وقت النوم.
import worker from "./.open-next/worker.js";

export * from "./.open-next/worker.js";

export default {
  ...worker,
  async scheduled(event, env, ctx) {
    const base = env.APP_BASE_URL || "http://localhost";
    const req = new Request(`${base}/api/worker`, {
      method: "POST",
      headers: { "x-worker-secret": env.WORKER_SECRET || "dev-secret" },
    });
    // استدعاء داخلي مباشر لمعالج الطلبات نفسه — طلب مستقل بميزانية كاملة
    ctx.waitUntil(
      Promise.resolve(worker.fetch(req, env, ctx))
        .then((r) => console.log("cron worker tick:", r.status))
        .catch((e) => console.error("cron worker tick:", e)),
    );
  },
};
