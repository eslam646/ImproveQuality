import { NextResponse } from "next/server";
import { escapeHtml } from "@/lib/util";

export const dynamic = "force-dynamic";

// قرار إداري: أزرار القبول/الرفض أُلغيت من الإيميلات نهائياً —
// القرارات تُتخذ من داخل النظام فقط (تسجيل دخول + صلاحيات + سجل تدقيق).
// هذا المسار باقٍ فقط ليستقبل ضغطات الأزرار في الإيميلات القديمة ويوجّه أصحابها بلطف.
function page(title: string, inner: string): NextResponse {
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#f1f5f9;margin:0;padding:24px;display:flex;justify-content:center}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 4px 16px rgba(15,23,42,.06);max-width:520px;width:100%;padding:28px;margin-top:32px;text-align:center}
  h1{font-size:20px;margin:0 0 12px;color:#0f172a}
  p{color:#475569;font-size:15px;line-height:1.9;margin:8px 0}
  a.btn{display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:10px;padding:12px 22px;font-weight:700;margin-top:14px}
</style></head><body><div class="card">${inner}</div></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } }) as NextResponse;
}

const MESSAGE = `<h1>🔒 اتخاذ القرار انتقل إلى داخل النظام</h1>
  <p>أزرار القبول والرفض في الإيميلات أُوقفت — لاتخاذ قرارك افتح الطلب من داخل النظام بحسابك، وستجد أزرار القبول/الرفض هناك.</p>
  <p>هذا أكثر أماناً: القرار يُسجل بهويتك المسجل دخولها وبصلاحياتك.</p>
  <a class="btn" href="/dashboard">فتح النظام ↗</a>`;

export async function GET() {
  return page("انتقل إلى النظام", MESSAGE);
}

export async function POST() {
  return page("انتقل إلى النظام", MESSAGE);
}
