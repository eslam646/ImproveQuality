/**
 * تجهيز Supabase للإنتاج في خطوة واحدة:
 *   node scripts/provision-supabase.mjs
 * متغيرات البيئة المطلوبة:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL  (postgres connection string)
 *   ADMIN_PIN         — الرقم السري لأول مدير (سيُشفَّر ويُخزَّن)
 * اختيارية (لجدولة التذكيرات):
 *   APP_URL           — لينك Workers النهائي مثل https://support-hub.xxx.workers.dev
 *   WORKER_SECRET     — سرّ نقطة العامل /api/worker
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const need = (k) => {
  const v = process.env[k];
  if (!v) { console.error(`❌ متغير البيئة ${k} مطلوب`); process.exit(1); }
  return v;
};

const SUPABASE_URL = need("SUPABASE_URL").replace(/\/$/, "");
const SERVICE_KEY = need("SUPABASE_SERVICE_ROLE_KEY");
const DATABASE_URL = need("DATABASE_URL");
const ADMIN_PIN = need("ADMIN_PIN");
const APP_URL = (process.env.APP_URL ?? "").replace(/\/$/, "");
const WORKER_SECRET = process.env.WORKER_SECRET ?? "";

const pinHash = (pin) => crypto.createHash("sha256").update(`support-hub-pin:${pin}`).digest("hex");

console.log("▶ 1/4 إنشاء bucket المرفقات العام (attachments)…");
{
  const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json", apikey: SERVICE_KEY },
    body: JSON.stringify({ id: "attachments", name: "attachments", public: true }),
  });
  const t = await r.text();
  if (r.ok) console.log("   ✅ تم إنشاء الـ bucket");
  else if (/already exists|Duplicate/i.test(t)) console.log("   ⏭️ موجود مسبقاً");
  else console.log(`   ⚠️ ${r.status}: ${t.slice(0, 200)} (لو Bucket موجود يدوياً تجاهل)`);
}

console.log("▶ 2/4 تشغيل مخطط قاعدة البيانات (supabase/schema.sql)…");
const schemaPath = path.join(process.cwd(), "supabase", "schema.sql");
if (!fs.existsSync(schemaPath)) { console.error("❌ supabase/schema.sql غير موجود"); process.exit(1); }
const sql = fs.readFileSync(schemaPath, "utf8").replace(/^\s*--.*$/gm, "").trim();

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(sql);
console.log("   ✅ الجداول + بذور البيانات جاهزة");

console.log("▶ 3/4 ضبط PIN المدير الأول…");
{
  const r = await client.query(
    `update staff set pin_hash=$1 where id=(select id from staff where role='admin' and active=1 order by created_at limit 1) returning name`,
    [pinHash(ADMIN_PIN)],
  );
  if (r.rowCount > 0) console.log(`   ✅ تم ضبط PIN للمدير: ${r.rows[0].name}`);
  else console.log("   ⚠️ لم يوجد مدير نشط — اضبطه لاحقاً من شاشة الموظفين");
}

console.log("▶ 4/4 جدولة عامل المهام (pg_cron ← /api/worker كل دقيقة)…");
if (APP_URL && WORKER_SECRET) {
  try {
    await client.query(`create extension if not exists pg_cron`);
    await client.query(`create extension if not exists pg_net`);
    await client.query(`select cron.unschedule(jobid) from cron.job where jobname='support-hub-worker'`).catch(() => {});
    await client.query(
      `select cron.schedule('support-hub-worker', '* * * * *', $1)`,
      [`select net.http_post(url:='${APP_URL}/api/worker', headers:='{"x-worker-secret": "${WORKER_SECRET}"}'::jsonb)`],
    );
    console.log(`   ✅ التذكيرات والإيميلات المجدولة تعمل كل دقيقة على ${APP_URL}/api/worker`);
  } catch (e) {
    console.log(`   ⚠️ تعذّرت الجدولة: ${String(e.message ?? e).slice(0, 300)}`);
    console.log("   بديل مجاني: cron-job.org ← كل دقيقة ← POST إلى نفس الرابط بالترويسة نفسها (موثق في README)");
  }
} else {
  console.log("   ⏭️ تخطّي (APP_URL/WORKER_SECRET غير مضبوطين) — أعد التشغيل بعد أول نشر لضبط الجدولة");
}

await client.end();
console.log("\n🎉 اكتمل التجهيز!");
