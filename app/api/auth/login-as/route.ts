import { getRepo } from "@/lib/db";

// تبديل الهوية في وضع العرض التجريبي — بدون كوكيز وبدون إعادة توجيه مطلقة:
// نحفظ الهوية في قاعدة البيانات ونرجع صفحة HTML فيها meta refresh لمسار نسبي،
// فتعمل داخل iframe المعاينة وخارجه ومن أي خلف بروكسي.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const staffId = searchParams.get("staff_id") ?? "";
  const next = searchParams.get("next") ?? "/dashboard";
  const repo = await getRepo();
  const staff = staffId ? await repo.staffGet(staffId) : null;

  if (staff && staff.active) {
    await repo.settingsValueSet("demo_current_staff", staff.id);
  }

  const target = next.startsWith("/") ? next : "/dashboard";
  const label = staff ? `${staff.name}` : "غير معروف";
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${target}">
<title>جاري الدخول…</title>
<style>body{font-family:system-ui;background:#f1f5f9;display:grid;place-items:center;min-height:100vh;margin:0}
.c{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;text-align:center;max-width:340px}
a{color:#1d4ed8;font-weight:700}</style></head>
<body><div class="c">
<div style="font-size:40px">${staff ? "✅" : "⚠️"}</div>
<p><b>${staff ? `تم الدخول كـ ${label}` : "هوية غير صحيحة"}</b></p>
<p>جاري تحويلك… <a href="${target}">اضغط هنا إن لم تُحوَّل تلقائياً</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</div></body></html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
