# 🎫 بوابة الدعم الفني — Support Hub

نظام تذاكر دعم فني متكامل **مفتوح المصدر ومجاني 100%** — بديل سيرا كود (Custom Code) لما كنت تبنيه على Lark Base:
جداول وواجهات متعددة الأدوار + نماذج عامة بدون تسجيل + **محرك أتمتة مرئي** (إيميلات بـ To/CC + إشعارات + تذكيرات مجدولة) بلا حدود على القواعد أو السجلات.

---

## ✅ خريطة التطابق مع Lark

| ما كنت تفعله في Lark | مقابله هنا |
|---|---|
| Grid Views (مدير / مطور / تيستينج) | `/dashboard` حسب الدور — المطور **قراءة فقط** مفروضة من الخادم |
| دالة SWITCH لتعيين الإيميلات | جدول **الموظفون**: (المدير المباشر + البريد) — حل المستلمين بالانضمام |
| نموذج إنشاء طلب | `/tickets/new` (داخلي) + `/submit` (**عام بدون تسجيل — بمفتاح تشغيل/إيقاف من الإعدادات**) |
| نموذج تحديث معبأ مسبقاً بالكود | `/update-form?code=…` — الحقول مقفلة **في الخادم** لا في المتصفح |
| واجهة استعلام آمنة بالكود | `/track?code=…` — يعيد الحالة فقط + Rate-Limit + كود عشوائي مقاوم للتخمين |
| Automation (Trigger → Action) | **مركز الأتمتة** `/automation` — باني قواعد مرئي بلا سقف |
| إيميل عند إنشاء/تعيين/تغيير حالة | جاهز بـ 4 قواعد مزروعة + **CC مدعوم** لكل قاعدة + قوالب عربية قابلة للتحرير |
| التذكيرات المجدولة | قاعدة `schedule.stale` + pg_cron كل دقيقة + مفاتيح عدم تكرار (مرة واحدة يومياً/تذكرة) |

---

## 🚀 التشغيل المحلي (دقيقتان — بدون أي حسابات)

```bash
npm install
npm run dev          # الواجهة على http://localhost:3000
npm run worker       # في نافذة ثانية: عامل المهام والتذكيرات
```

- يعمل فوراً بقاعدة **SQLite محلية** و**وضع بريد تسجيلي** (الإيميلات تُعرض كاملة في «سجل البريد» دون إرسال فعلي) — مثالي للتجربة.
- سجّل من `/login` (وضع تجريبي): **أحمد المدير** (أدمن) · سارة (دعم) · أحمد سمير (مطور) · كريم (تيستر).

### جرّب الأتمتة في 60 ثانية
1. بلا تسجيل: افتح `/submit` وأرسل طلباً ← ستحصل على كود `T-XXXX`.
2. انتظر دورة العامل (أو نفّذ `curl -X POST localhost:3000/api/worker -H 'x-worker-secret: dev-secret'`).
3. من حساب الأدمن افتح **سجل البريد**: إيميل «طلب جديد» للإدارة وCC للعميل + إشعار 🔔 داخلي.
4. ادخل بحساب `أحمد سمير` (مطور): لاحظ أن المحررات كلها مقفلة (قراءة فقط)، ثم حدّث الحالة من `/update-form?code=…` بالكود.
5. عامل المهام يرسل «تحديث حالة» للمعنيين — وكل خطوة موثقة في سجل أحداث التذكرة.

---

## 🏗️ المعمارية (لماذا لا تضيع رسالة أبداً؟)

```
نموذج/واجهة → عملية على التذكرة → سجل أحداث (Events) → محرك القواعد يطابق Triggers/Conditions
     → طابور مهام jobs (مفتاح Idempotency لكل مهمة) → العامل /api/worker كل دقيقة (pg_cron)
     → تنفيذ: إيميل (Brevo أساسي ← Resend احتياطي) / إشعار داخلي / تحديث حقل
     → فشل؟ إعادة محاولة أسّية ×5 ثم Dead Letter — وكل رسالة في «سجل البريد»
```

- **القواعد بيانات لا كود**: أضف/عدّل أتمتة من `/automation` بلا Deploy.
- **الواجهات أدوار على جدول واحد** — لا تكرار بيانات، والصلاحيات في الخادم.
- طبقة بيانات موحّدة: `DB_DRIVER=sqlite` محلياً ← `DB_DRIVER=supabase` في الإنتاج.

---

## ☁️ النشر للإنتاج (مجاني بالكامل)

### 1) Supabase (قاعدة البيانات + Auth)
1. أنشئ مشروعاً مجانياً على [supabase.com](https://supabase.com).
2. من **SQL Editor** الصق محتوى `supabase/schema.sql` كاملاً ونفّذه (الجداول + الفهارس + RLS).
3. من **Settings → API** انسخ: `Project URL` و`service_role` و`anon` key.

### 2) Brevo (الإيميلات — 300/يوم مجاناً)
1. أنشئ حساباً على [brevo.com](https://brevo.com) ← **SMTP & API → API Keys** ← انسخ `BREVO_API_KEY`.
2. **Senders → Domains**: أضف دومينك وأكمل سجلات DNS (SPF + DKIM + DMARC) — خطوة لمرة واحدة تجعل الإيميلات تخرج من `support@yourdomain.com`.
3. (اختياري) **Webhooks**: أضف `https://YOUR-APP/api/webhooks/brevo` لتحديث حالة التسليم في السجل تلقائياً.
4. (احتياطي إضافي) مفتاح `RESEND_API_KEY` من resend.com — يُستخدم تلقائياً لو فشل الأساسي.

### 3) Cloudflare (الاستضافة)
```bash
npm i -D @opennextjs/cloudflare wrangler
npx opennextjs-cloudflare build
npx wrangler login && npx wrangler deploy
```
ثم من لوحة Cloudflare ← **Settings → Variables and Secrets** أضف:

| المتغير | القيمة |
|---|---|
| `DB_DRIVER` | `supabase` |
| `SUPABASE_URL` | رابط مشروعك |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح service_role |
| `SUPABASE_ANON_KEY` | مفتاح anon |
| `AUTH_MODE` | `supabase` (ماجيك لينك للفريق) أو `demo` مؤقتاً |
| `BREVO_API_KEY` | مفتاح Brevo |
| `EMAIL_FROM_ADDRESS` | `support@yourdomain.com` |
| `WORKER_SECRET` | سر عشوائي طويل |
| `APP_BASE_URL` | `https://YOUR-APP.workers.dev` |

> بديل النشر: Vercel بأمر `vercel --prod` — لكن لاحظ أن خطته المجانية للاستخدام غير التجاري فقط، وكرونه يومي؛ أتمتتك هنا تعمل من Supabase أصلاً فلن تتأثر.

### 4) تفعيل الجدولة (كرون مجاني بدقة الدقيقة)
في Supabase SQL Editor نفّذ (بعد تعديل الرابط والسر) القسم ③ في `supabase/schema.sql`:
```sql
select cron.schedule('support-hub-worker', '* * * * *', $$
  select net.http_post(
    url := 'https://YOUR-APP/api/worker',
    headers := jsonb_build_object('content-type','application/json','x-worker-secret','YOUR_WORKER_SECRET'),
    body := '{}'::jsonb);
$$);
```
راقب: `select * from cron.job_run_details order by start_time desc limit 10;`

---

## 👥 الأدوار والواجهات

| الدور | ما يراه |
|---|---|
| **مدير النظام** | كل شيء + الأتمتة + القوالب + الموظفون + سجل البريد + الإعدادات |
| **دعم/مدخل بيانات** | Grid كامل + إنشاء + تعيين + تحديث حالة + تصدير CSV |
| **مطور** | قراءة فقط (كل التذاكر أو «تذاكري») + يحدّث الحالة عبر `/update-form` بالكود |
| **تيستر** | `/testing`: بطاقات «جاهز للاختبار» مع زري **اجتاز/فشل** — كل ضغطة تُطلق إشعارات |
| **زائر** | `/submit` طلب جديد (إن فعّلته) + `/track` تتبع + `/update-form` تحديث بالكود |

---

## 🧩 التوسعة المستقبلية (كل شيء جاهز لها)
- **المرفقات على Cloudflare R2** (10GB مجاناً): الكود معزول في نقطة رفع واحدة — بدّل الحفظ المحلي بـ S3 API.
- **Realtime للإشعارات**: فعّل اشتراك Supabase Realtime على جدول `notifications` بدل التحديث عند التنقل.
- **قواعد أتمتة أعمق**: أضف حقولاً للتذكرة (أعمدة جديدة) ثم استخدمها في الشروط مباشرة.
- **Rate-Limit موزع**: بدّل `lib/ratelimit.ts` بـ Upstash Ratelimit عند النشر متعدد النسخ.

## 📦 النسخ الاحتياطي
- سريع من الواجهة: زر **تصدير Excel/CSV** في لوحة التحكم.
- كامل: `pg_dump` دوري أو نسخ Supabase الأسبوعية (7 أيام في المجاني).
- ملاحظة: مشاريع Supabase المجانية تتوقف بعد أسبوع خمول — طبيعة نظامك يومية الاستخدام وعامل pg_cron يضرب قاعدة البيانات كل دقيقة أصلاً.

## 🗂️ بنية الكود
```
support-hub/
├── app/                    # الصفحات (App Router): dashboard/tickets/automation/templates/staff/emails/settings
│   ├── api/                # public submit/track/update-status · worker · attachments · export.csv · webhooks
│   └── actions/            # Server Actions (تذاكر/قواعد/إدارة)
├── components/             # Grid · باني القواعد · محرر القوالب · النماذج العامة
├── lib/
│   ├── db/                 # واجهة موحدة + تنفيذ SQLite + تنفيذ Supabase
│   ├── engine.ts           # محرك الأتمتة: مطابقة القواعد + حل المستلمين + التذكيرات
│   ├── worker.ts           # منفّذ المهام (إيميل/إشعار/تحديث) مع إعادة المحاولة
│   ├── ops.ts              # عمليات التذاكر (إنشاء/تعيين/تحديث) — تبث الأحداث
│   └── email.ts            # Brevo ← Resend ← وضع التسجيل
├── supabase/schema.sql     # كل شيء للصق في Supabase
└── scripts/worker-loop.ts  # عامل محلي للتطوير
```
