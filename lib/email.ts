// طبقة إرسال الإيميلات — Brevo أساسي (300/يوم مجاناً) ثم Resend احتياطي، وبدون مفاتيح = وضع التسجيل
import type { Settings } from "./types";

export interface SendResult {
  provider: "brevo" | "resend" | "log";
  msgId: string | null;
  error?: string;
}

export async function sendMail(
  args: { to: string[]; cc: string[]; subject: string; html: string },
  settings: Settings,
): Promise<SendResult> {
  const fromEmail = settings.sender_email || process.env.EMAIL_FROM_ADDRESS || "no-reply@support-hub.local";
  const fromName = settings.sender_name || "الدعم الفني";

  if (process.env.BREVO_API_KEY) {
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({
          sender: { name: fromName, email: fromEmail },
          to: args.to.map((email) => ({ email })),
          ...(args.cc.length ? { cc: args.cc.map((email) => ({ email })) } : {}),
          subject: args.subject,
          htmlContent: args.html,
        }),
      });
      if (res.ok) {
        const j = (await res.json()) as { messageId?: string };
        return { provider: "brevo", msgId: j.messageId ?? null };
      }
      const text = await res.text();
      console.error("Brevo error:", res.status, text);
      if (!process.env.RESEND_API_KEY) return { provider: "brevo", msgId: null, error: `HTTP ${res.status}: ${text}` };
      // وإلا نكمل للاحتياطي Resend
    } catch (e) {
      console.error("Brevo exception:", e);
      if (!process.env.RESEND_API_KEY) return { provider: "brevo", msgId: null, error: String(e) };
    }
  }

  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: args.to,
          ...(args.cc.length ? { cc: args.cc } : {}),
          subject: args.subject,
          html: args.html,
        }),
      });
      if (res.ok) {
        const j = (await res.json()) as { id?: string };
        return { provider: "resend", msgId: j.id ?? null };
      }
      const text = await res.text();
      return { provider: "resend", msgId: null, error: `HTTP ${res.status}: ${text}` };
    } catch (e) {
      return { provider: "resend", msgId: null, error: String(e) };
    }
  }

  // وضع التسجيل — مثالي للتجربة المحلية: الإيميل يُسجل ويُعرض في "سجل البريد"
  console.log(`[EMAIL:LOG] to=${args.to.join(",")} cc=${args.cc.join(",")} subject=${args.subject}`);
  return { provider: "log", msgId: null };
}
