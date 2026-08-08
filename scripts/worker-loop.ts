// عامل مهام محلي للتطوير — في الإنتاج يستدعي pg_cron النقطة /api/worker بدلاً منه
import { processAll } from "../lib/worker";

const INTERVAL = (parseInt(process.env.WORKER_INTERVAL_SEC || "20", 10) || 20) * 1000;

async function tick() {
  try {
    const r = await processAll();
    if (r.processed || r.remindersEnqueued || r.retried || r.dead) {
      console.log(`[worker ${new Date().toISOString()}]`, JSON.stringify(r));
    }
  } catch (e) {
    console.error("[worker error]", e);
  }
}

console.log(`⚙️  عامل المهام يعمل — فحص الطابور كل ${INTERVAL / 1000} ثانية (أوقفه بـ Ctrl+C)`);
void tick();
setInterval(tick, INTERVAL);
