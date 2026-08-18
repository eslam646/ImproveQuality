import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { verifyAssignmentToken } from "@/lib/assignment-links";
import { respondToAssignmentOp } from "@/lib/ops";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { escapeHtml } from "@/lib/util";

export const dynamic = "force-dynamic";

// صفحة تأكيد قرار التكليف من الإيميل — بدون تسجيل دخول، بتوكن موقّع
// GET: صفحة تأكيد (حماية من ماسحات الروابط في برامج البريد) — POST: تنفيذ القرار فعلياً

function page(title: string, inner: string, ok = true): NextResponse {
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#f1f5f9;margin:0;padding:24px;display:flex;justify-content:center}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 4px 16px rgba(15,23,42,.06);max-width:520px;width:100%;padding:28px;margin-top:32px}
  h1{font-size:20px;margin:0 0 12px;color:${ok ? "#0f172a" : "#b91c1c"}}
  p{color:#475569;font-size:15px;line-height:1.9;margin:8px 0}
  .meta{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;font-size:14px;margin:14px 0}
  textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;min-height:90px}
  button{border:0;border-radius:10px;padding:12px 22px;font-size:15px;font-weight:700;color:#fff;cursor:pointer;width:100%;margin-top:12px}
  .ok{background:#059669}.no{background:#dc2626}
  .hint{font-size:12px;color:#94a3b8}
</style></head><body><div class="card">${inner}</div></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } }) as NextResponse;
}

async function loadContext(token: string) {
  const p = verifyAssignmentToken(token);
  if (!p) return { error: "الرابط غير صالح أو انتهت صلاحيته — استخدم صفحة الطلب مباشرة من داخل النظام." } as const;
  const repo = await getRepo();
  const [ticket, staff] = await Promise.all([repo.ticketById(p.t), repo.staffGet(p.s)]);
  if (!ticket) return { error: "الطلب غير موجود — ربما حُذف." } as const;
  if (!staff || !staff.active) return { error: "حساب الموظف غير متاح." } as const;
  const assignedId = p.r === "tester" ? ticket.tester_id : ticket.developer_id;
  if (assignedId !== staff.id) return { error: "هذا التكليف لم يعد مسنداً إليك — ربما أُعيد إسناده لشخص آخر." } as const;
  // بعد الإقفال أو إنهاء جزئك لا يوجد قرار — رابط الإيميل القديم يصبح للعرض فقط
  if (ticket.urgent_ended_at) return { error: "هذا الدعم الفوري انتهى وأُقفل رسمياً — لا يوجد قرار مطلوب منك." } as const;
  const current = p.r === "tester" ? ticket.tester_assignment_status : ticket.developer_assignment_status;
  if (current === "completed") return { error: "لقد أنهيت عملك على هذا الطلب بالفعل — لا يمكن قبول أو رفض التكليف بعد الإنهاء." } as const;
  return { p, ticket, staff, current } as const;
}

export async function GET(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`asg-view:${ip}`, 30, 60_000)) return page("محاولات كثيرة", "<h1>محاولات كثيرة</h1><p>حاول بعد دقيقة.</p>", false);
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ctx = await loadContext(token);
  if ("error" in ctx) return page("رابط غير صالح", `<h1>تعذر فتح الرابط</h1><p>${escapeHtml(ctx.error ?? "")}</p>`, false);
  const { p, ticket, staff, current } = ctx;
  const roleLabel = p.r === "tester" ? "التيست" : "المطوّر";

  if (current === "accepted" && p.d === "accepted") {
    return page("تم مسبقاً", `<h1>✅ سبق قبول هذا التكليف</h1><p>أنت بالفعل موافق على الطلب <b dir="ltr">${escapeHtml(ticket.code)}</b> — لا حاجة لأي إجراء.</p>`);
  }

  const meta = `<div class="meta">
    <div><b>الطلب:</b> <span dir="ltr">${escapeHtml(ticket.code)}</span>${ticket.is_urgent ? " — 🚨 دعم فوري" : ""}</div>
    <div><b>العنوان:</b> ${escapeHtml(ticket.title || ticket.details.slice(0, 80))}</div>
    <div><b>العميل:</b> ${escapeHtml(ticket.client_name)}</div>
    <div><b>بصفتك:</b> ${escapeHtml(staff.name)} (${roleLabel})</div>
  </div>`;

  const form = p.d === "accepted"
    ? `<form method="post" action="/api/assignment/respond?token=${encodeURIComponent(token)}">
         <button class="ok" type="submit">✅ تأكيد الموافقة على التكليف</button>
       </form>`
    : `<form method="post" action="/api/assignment/respond?token=${encodeURIComponent(token)}">
         <label style="font-size:14px;font-weight:700;color:#334155">سبب الاعتذار (إجباري — يُرسل بالإيميل لمدخل البيانات والإدارة):</label>
         <textarea name="reason" required minlength="3" placeholder="مثال: مشغول بعطل عاجل آخر حالياً…"></textarea>
         <button class="no" type="submit">❌ تأكيد الاعتذار وإرسال السبب</button>
       </form>`;

  return page(
    p.d === "accepted" ? "تأكيد قبول التكليف" : "الاعتذار عن التكليف",
    `<h1>${p.d === "accepted" ? "تأكيد قبول التكليف" : "الاعتذار عن التكليف"}</h1>${meta}${form}
     <p class="hint">خطوة التأكيد هذه تحمي من تسجيل القرار بالخطأ عند فتح الرابط تلقائياً من برامج البريد.</p>`,
  );
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`asg-do:${ip}`, 10, 60_000)) return page("محاولات كثيرة", "<h1>محاولات كثيرة</h1><p>حاول بعد دقيقة.</p>", false);
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ctx = await loadContext(token);
  if ("error" in ctx) return page("رابط غير صالح", `<h1>تعذر التنفيذ</h1><p>${escapeHtml(ctx.error ?? "")}</p>`, false);
  const { p, ticket, staff } = ctx;

  let reason = "";
  try {
    const form = await req.formData();
    reason = String(form.get("reason") ?? "").trim();
  } catch { /* لا نموذج */ }
  if (p.d === "declined" && reason.length < 3) {
    return page("السبب إجباري", "<h1>سبب الاعتذار إجباري</h1><p>ارجع للخلف واكتب السبب بوضوح — يُرسل بالإيميل ويُسجل.</p>", false);
  }

  const r = await respondToAssignmentOp(
    ticket.id,
    { staff_id: staff.id, name: staff.name, role: staff.role },
    p.d,
    reason || undefined,
  );
  if (!r.ok) return page("تعذر التنفيذ", `<h1>تعذر تسجيل القرار</h1><p>${escapeHtml(r.error ?? "خطأ غير متوقع")}</p>`, false);

  return page(
    "تم بنجاح",
    p.d === "accepted"
      ? `<h1>✅ تم قبول التكليف</h1><p>سُجل قبولك للطلب <b dir="ltr">${escapeHtml(ticket.code)}</b> وأُبلغ المعنيون بالإيميل. يمكنك إغلاق هذه الصفحة أو فتح الطلب من داخل النظام.</p>`
      : `<h1>تم تسجيل اعتذارك</h1><p>أُبلغ مدخل البيانات والإدارة بسبب الاعتذار، وعاد الطلب <b dir="ltr">${escapeHtml(ticket.code)}</b> لإعادة الإسناد.</p>`,
  );
}
