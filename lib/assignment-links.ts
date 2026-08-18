// روابط قبول/رفض التكليف من داخل الإيميل — موقعة بتوقيع HMAC ولا تحتاج تسجيل دخول
// الأمان: التوكن مربوط بالتذكرة + الموظف + الدور + القرار + تاريخ انتهاء، وأي تعديل يبطل التوقيع.
// التنفيذ الفعلي يتم بضغطة تأكيد (POST) وليس بمجرد فتح الرابط — حماية من ماسحات الإيميل التي تفتح الروابط تلقائياً.
import crypto from "node:crypto";
import type { Staff, Ticket } from "./types";

const secret = () => process.env.WORKER_SECRET || "dev-secret";

export interface AssignmentTokenPayload {
  t: string;                       // ticket id
  s: string;                       // staff id
  r: "tester" | "developer";       // دور التكليف
  d: "accepted" | "declined";      // القرار
  exp: number;                     // انتهاء الصلاحية (epoch ms)
}

export function signAssignmentToken(p: AssignmentTokenPayload): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyAssignmentToken(token: string): AssignmentTokenPayload | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as AssignmentTokenPayload;
    if (!p.t || !p.s || !["tester", "developer"].includes(p.r) || !["accepted", "declined"].includes(p.d)) return null;
    if (!p.exp || Date.now() > p.exp) return null;
    return p;
  } catch {
    return null;
  }
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

// بلوك أزرار جاهز يُلحق بإيميل التكليف: قبول / اعتذار / فتح الطلب
export function assignmentEmailActions(
  baseUrl: string,
  ticket: Ticket,
  role: "tester" | "developer",
  assignee: Pick<Staff, "id" | "name">,
): string {
  const base = baseUrl.replace(/\/$/, "");
  const mk = (d: "accepted" | "declined") =>
    `${base}/api/assignment/respond?token=${encodeURIComponent(signAssignmentToken({ t: ticket.id, s: assignee.id, r: role, d, exp: Date.now() + WEEK_MS }))}`;
  const btn = (href: string, label: string, bg: string) =>
    `<a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;border-radius:10px;padding:11px 20px;font-size:14px;font-weight:700;margin:4px 6px 0 0">${label}</a>`;
  const roleLabel = role === "tester" ? "التيست" : "المطوّر";
  return `
    <div style="margin-top:20px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 16px">
      <div style="font-size:14px;font-weight:800;color:#92400e;margin-bottom:8px">قرارك مطلوب — يمكنك الرد مباشرة من هنا:</div>
      <div>
        ${btn(mk("accepted"), "✅ أوافق على التكليف", "#059669")}
        ${btn(mk("declined"), "❌ الاعتذار (مع كتابة السبب)", "#dc2626")}
        ${btn(`${base}/tickets/${encodeURIComponent(ticket.code)}`, "🔍 فتح الطلب", "#1d4ed8")}
      </div>
      <div style="font-size:12px;color:#a16207;margin-top:8px">هذه الأزرار خاصة بـ<b>${assignee.name}</b> (${roleLabel}) فقط — الضغط عليها يسجل القرار باسمه في سجل التدقيق.</div>
    </div>`;
}
