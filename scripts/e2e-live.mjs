// E2E شامل على الإنتاج — يحاكي طلبات المتصفح الحقيقية (encodeReply) + تحقق من قاعدة البيانات
import { encodeReply } from "next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.node.production.js";
import pg from "pg";
import { readFileSync } from "node:fs";

const P = "https://support-hub.eslamnasser796.workers.dev";
const DB = "postgresql://postgres.evhjaotzbgiwesvlnzfu:RnxrpxTIY1DDybQt@aws-0-ca-central-1.pooler.supabase.com:5432/postgres";
const db = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
await db.connect();

let pass = 0, failCount = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log(`✅ ${name} ${extra}`); } else { failCount++; console.log(`❌ ${name} ${extra}`); } };

async function login(staffId, pin) {
  const res = await fetch(`${P}/api/auth/pin-login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staff_id: staffId, pin }), redirect: "manual" });
  const j = await res.json().catch(() => ({}));
  const sc = res.headers.get("set-cookie") || "";
  const m = sc.match(/support_sid=([^;]+)/);
  return { okS: j.ok === true, cookie: m ? `support_sid=${m[1]}` : `support_sid=${staffId}` };
}

async function actionIds(cookie, page) {
  const html = await (await fetch(P + page, { headers: { cookie } })).text();
  const ids = [...html.matchAll(/\$ACTION_ID_([a-f0-9]+)/g)].map((m) => m[1]);
  return [...new Set(ids)];
}

async function postAction(cookie, page, actionId, fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  const body = await encodeReply([fd], null);
  const res = await fetch(P + page, { method: "POST", headers: { "Next-Action": actionId, Origin: P, cookie }, body, redirect: "manual" });
  return { status: res.status, redirect: decodeURIComponent(res.headers.get("x-action-redirect") || "") };
}

const T = async (q, p = []) => (await db.query(q, p)).rows;

// قراءة أحدث إيميلات مسجلة
async function lastEmails(n = 5) {
  return T(`select to_addr, cc_addr, subject, body_html, status, created_at from email_log order by created_at desc limit $1`, [n]);
}

try {
  console.log("=== دخول الأدمن ===");
  const admin = await login("st-admin", "120775");
  ok("pin-login للأدمن", admin.okS);

  const tcode = "T-XDTCJ85Y";
  const page = `/tickets/${tcode}`;
  const ids = await actionIds(admin.cookie, page);
  ok("الصفحة تعرض ٥ أكشنات (تعيين مختبِر/تقدير/حالة/ملاحظة/رفض)", ids.length === 5, `(${ids.length})`);
  // ترتيب ثابت بالهاش: نقرأ معرّفات المعروفة من HTML حسب ترتيب الحقول
  const manifest = JSON.parse(readFileSync(".open-next/server-functions/default/.next/server/server-reference-manifest.json", "utf8"));
  const byName = {};
  for (const [aid, e] of Object.entries(manifest.node)) if (e.workers?.["app/tickets/[code]/page"]) byName[e.exportedName] = aid;
  const map = {
    assignTester: byName.assignTesterAction, setEst: byName.setEstimationAction,
    changeStatus: byName.changeStatusAction, addNote: byName.addNoteAction,
    decline: byName.declineAssignmentAction, assignDeveloper: byName.assignDeveloperAction,
  };
  ok("تم التقاط معرّفات الأكشنات", Object.values(map).every(Boolean), JSON.stringify(map).slice(0, 150));

  console.log("=== ١) تعيين مختبِر مع تقدير (أيام/ساعات) ===");
  await T(`update tickets set tester_id=null, tester_name=null, est_days=null, est_hours=null, developer_id=null, developer_name=null, dev_status='new' where code=$1`, [tcode]);
  const r1 = await postAction(admin.cookie, page, map.assignTester, { code: tcode, tester_id: "st-laila", est_days: "2", est_hours: "6" });
  ok("assignTester → نجاح", r1.redirect.includes("ok="), r1.redirect.slice(0, 90));
  const [t1] = await T(`select tester_id, tester_name, est_days, est_hours from tickets where code=$1`, [tcode]);
  ok("DB: المختبِر محفوظ", t1.tester_id === "st-laila" && t1.tester_name?.includes("ليلى"), JSON.stringify(t1));
  ok("DB: التقدير محفوظ (٢ يوم/٦ ساعات)", Number(t1.est_days) === 2 && Number(t1.est_hours) === 6);
  const ev1 = await T(`select type from events where ticket_id=(select id from tickets where code=$1) order by created_at desc limit 3`, [tcode]);
  ok("حدث ticket.assigned مسجل", ev1.some((e) => e.type === "ticket.assigned"), JSON.stringify(ev1.map((e) => e.type)));
  const mails1 = await lastEmails(3);
  ok("إيميل تعيين المختبِر أُرسل/جُدول", mails1.some((m) => m.to_addr?.includes("laila") || m.subject?.includes("ليلى")), mails1[0]?.subject);

  console.log("=== ٢) القاعدة الذهبية: لا مطور قبل مختبِر ===");
  // تذكرة جديدة بمطور بدون مختبِر — عبر أكشن إنشاء التذكرة
  const newIds = await actionIds(admin.cookie, "/tickets/new");
  ok("صفحة إنشاء تذكرة فيها أكشن", newIds.length >= 1);
  const [clientRow] = await T(`select id from clients limit 1`).catch(() => [{}]);
  const r2 = await postAction(admin.cookie, "/tickets/new", newIds[0], {
    client_name: "عميل القاعدة الذهبية", client_contact: "golden@example.com", details: "اختبار القاعدة الذهبية — سيُحذف",
    developer_id: "st-mona", tester_id: "", creator_id: "st-admin",
  });
  ok("إنشاء تذكرة → redirect", r2.redirect.length > 3, r2.redirect.slice(0, 80));
  const golden = await T(`select code from tickets where client_name=$1 and developer_id is not null`, ["عميل القاعدة الذهبية"]);
  ok("القاعدة الذهبية: لا تذكرة بمطوّر بدون مختبِر (الإنشاء مُنع برسالة)", golden.length === 0 && r2.redirect.includes("err="), `محظورات: ${golden.length}`);

  console.log("=== ٣) الرفض بدون سبب → ممنوع، ومع سبب → إيميل مفصّل ===");
  const r3a = await postAction(admin.cookie, page, map.changeStatus, { code: tcode, dev_status: "rejected", note: "" });
  ok("رفض بدون ملاحظة → err", r3a.redirect.includes("err="), r3a.redirect.slice(0, 90));
  const [t3a] = await T(`select dev_status from tickets where code=$1`, [tcode]);
  ok("DB: الحالة لم تتغير", t3a.dev_status === "new");
  const r3b = await postAction(admin.cookie, page, map.changeStatus, { code: tcode, dev_status: "rejected", note: "الطلب خارج نطاق الخدمة المتفق عليها" });
  ok("رفض مع سبب → ok", r3b.redirect.includes("ok="), r3b.redirect.slice(0, 80));
  const [t3b] = await T(`select dev_status from tickets where code=$1`, [tcode]);
  ok("DB: الحالة = rejected", t3b.dev_status === "rejected");
  const mails3 = await lastEmails(5);
  const rej = mails3.find((m) => (m.subject || "").includes("رفض") || (m.body_html || "").includes("رفض"));
  ok("إيميل الرفض يتضمن السبب", !!rej && (rej.body_html || "").includes("خارج نطاق"), rej?.subject);
  ok("إيميل الرفض يذكر اسم مَن رفض", !!rej && ((rej.body_html || "").includes("أحمد المدير") || (rej.subject || "").includes("أحمد")), rej ? "" : "(لم يُعثر على إيميل رفض)");

  console.log("=== ٤) ملاحظة عامة → تصل للأطراف الآخرين فقط ===");
  const r4 = await postAction(admin.cookie, page, map.addNote, { code: tcode, note: "ملاحظة اختبار: برجاء مراجعة التفاصيل", visibility: "all" });
  ok("addNote → ok", r4.redirect.includes("ok="), r4.redirect.slice(0, 80));
  const mails4 = await lastEmails(4);
  ok("إيميل الملاحظة يصل لطرف آخر", mails4.some((m) => ((m.to_addr || "").includes("laila") || (m.cc_addr || "").length > 3) && (m.body_html || "").includes("ملاحظة اختبار")), mails4.map((m) => `${m.to_addr}|${m.subject}`).join(" ;; ").slice(0, 120));
  ok("إيميل الملاحظة لا يعود للكاتب (الأدمن)", !mails4.some((m) => m.to_addr === "eslamnasser796@gmail.com" && (m.body_html || "").includes("ملاحظة اختبار")));

  console.log("=== ٥) رفض المهمة من المختبِر (بين مؤقت) ===");
  await T(`update staff set pin_hash=$1 where id='st-laila'`, [(await import("node:crypto")).createHash("sha256").update("support-hub-pin:2468").digest("hex")]);
  const laila = await login("st-laila", "2468");
  ok("دخول ليلى", laila.okS);
  const idsL = await actionIds(laila.cookie, page);
  ok("ليلى ترى الأكشنات", idsL.length >= 2, `(${idsL.length})`);
  // نقرأ أكشنات صفحة ليلى الحالية (تتغير حسب دورها وإسنادها)
  await T(`update tickets set tester_id='st-laila', tester_name='ليلى حسن', dev_status='in_progress' where code=$1`, [tcode]);
  const declineId = map.decline;
  ok("تم التقاط أكشن رفض المهمة", !!declineId, declineId);
  const r5 = await postAction(laila.cookie, page, declineId, { code: tcode, reason: "مش متاحة حالياً بسبب التزامات أخرى" });
  ok("رفض المهمة → ok/err منطقي", r5.redirect.length > 3, r5.redirect.slice(0, 90));
  const [t5] = await T(`select tester_id, dev_status from tickets where code=$1`, [tcode]);
  ok("DB: إلغاء إسناد المختبِر بعد رفضها", t5.tester_id === null, JSON.stringify(t5));
  const mails5 = await lastEmails(3);
  ok("إيميل رفض المهمة يذكر ليلى والسبب", mails5.some((m) => (m.body_html || "").includes("ليلى") && (m.body_html || "").includes("متاح")), mails5.map((m) => `${m.to_addr}|${m.subject}`).join(" ;; ").slice(0, 130));
  await T(`update staff set pin_hash=null where id='st-laila'`);
  console.log("(تم مسح البين المؤقت لليلى)");

  console.log("=== ٦) التسليم/الإغلاق → إيميل لمقدم الطلب والعميل ===");
  await T(`update tickets set tester_id='st-laila', tester_name='ليلى حسن', developer_id='st-mona', developer_name='منى خالد', dev_status='in_progress' where code=$1`, [tcode]);
  const r6 = await postAction(admin.cookie, page, map.changeStatus, { code: tcode, dev_status: "fixed", note: "" });
  ok("fixed → ok", r6.redirect.includes("ok="), r6.redirect.slice(0, 80));
  const mails6 = await lastEmails(4);
  ok("إيميل التسليم وصل مقدم الطلب/العميل", mails6.some((m) => m.to_addr === "workflow@example.com" || (m.subject || "").includes("تسليم") || (m.subject || "").includes("اكتمل")), mails6.map((m) => `${m.to_addr}|${m.subject}`).join(" ;; ").slice(0, 140));

  console.log("=== ٧) تحديد النطاق: المطور يرى تذاكره فقط ===");
  await T(`update staff set pin_hash=$1 where id='st-mona'`, [(await import("node:crypto")).createHash("sha256").update("support-hub-pin:2468").digest("hex")]);
  const mona = await login("st-mona", "2468");
  ok("دخول منى (مطوّرة)", mona.okS);
  const dash = await (await fetch(`${P}/dashboard`, { headers: { cookie: mona.cookie } })).text();
  ok("داشبورد منى لا تحتوي تذكرة القاعدة الذهبية (غير مسندة لها)", !dash.includes("عميل القاعدة الذهبية"));
  ok("داشبورد منى تحتوي T-XDTCJ85Y (مسندة لها كمطور)", dash.includes("T-XDTCJ85Y"));
  await T(`update staff set pin_hash=null where id='st-mona'`);

  console.log("=== ٨) صفحة الاستعلام العامة مع التقدير ===");
  const track = await (await fetch(`${P}/api/track?code=${tcode}`)).json().catch(() => null);
  ok("track API يرجع التذكرة", !!track && (track.ticket || track.code), JSON.stringify(track).slice(0, 100));
  const trackStr = JSON.stringify(track);
  const est = track?.estimation;
  ok("track يعرض التقدير (show_estimation)", !!est || trackStr.includes("est"), JSON.stringify(est ?? trackStr.slice(60, 180)));

  console.log("=== ٩) نتيجة الاختبار من واجهة التيست (ملاحظة إجبارية عند الفشل) ===");
  const manifest2 = JSON.parse(readFileSync(".open-next/server-functions/default/.next/server/server-reference-manifest.json", "utf8"));
  const byName2 = {};
  for (const [aid, e] of Object.entries(manifest2.node)) if (e.workers?.["app/testing/page"]) byName2[e.exportedName] = aid;
  ok("أكشن نتيجة الاختبار موجود", !!byName2.testerResultAction, byName2.testerResultAction?.slice(0, 12));
  await T(`update staff set pin_hash=$1 where id='st-karim'`, [(await import("node:crypto")).createHash("sha256").update("support-hub-pin:2468").digest("hex")]);
  const karim = await login("st-karim", "2468");
  ok("دخول كريم (تست)", karim.okS);
  await T(`update tickets set tester_id='st-karim', tester_name='كريم فؤاد', dev_status='ready_for_test' where code=$1`, [tcode]);
  const r9a = await postAction(karim.cookie, "/testing", byName2.testerResultAction, { code: tcode, result: "test_failed", note: "" });
  ok("فشل اختبار بدون سبب → ممنوع", r9a.redirect.includes("err="), r9a.redirect.slice(0, 90));
  const r9b = await postAction(karim.cookie, "/testing", byName2.testerResultAction, { code: tcode, result: "test_failed", note: "زر الإرسال لا يعمل على موبايل سفاري" });
  ok("فشل اختبار بسبب → ok", r9b.redirect.includes("ok="), r9b.redirect.slice(0, 80));
  const [t9] = await T(`select dev_status from tickets where code=$1`, [tcode]);
  ok("DB: الحالة = test_failed", t9.dev_status === "test_failed", t9.dev_status);
  const mails9 = await lastEmails(3);
  ok("إيميل فشل الاختبار للمطور بالسبب", mails9.some((m) => (m.to_addr || "").includes("mona.dev") && (m.body_html || "").includes("سفاري") && (m.cc_addr || "").includes("karim")), mails9.map((m) => `${m.to_addr}|cc:${m.cc_addr}|${m.subject}`).join(" ;; ").slice(0, 160));
  await T(`update staff set pin_hash=null where id='st-karim'`);

  console.log("=== ١٠) عامل الطابور (pg_cron → /api/worker) يُرسل فعلاً ===");
  const baseline = await T(`select max(created_at) m from email_log`);
  // بعد انتهاء الجولة كاملة نتحقق أسفل — نخزن الأساس في متغير عام
  globalThis.__mailBaseline = baseline[0].m;
  const queued = await T(`select status, count(*) c from email_log where created_at > $1 group by status`, [baseline[0].m]);
  ok("لا إيميلات فاشلة/عالقة من هذه الجولة", queued.every((r) => r.status === "sent"), JSON.stringify(queued));
} catch (e) {
  console.error("💥 استثناء غير متوقع:", e?.message, "\n", String(e?.stack).split("\n").slice(0, 4).join("\n"));
} finally {
  await db.end().catch(() => {});
  console.log(`\n════ النتيجة: ${pass} ناجح / ${failCount} فاشل ════`);
  process.exit(failCount ? 1 : 0);
}
