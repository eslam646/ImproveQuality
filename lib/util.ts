import crypto from "crypto";

export const nowIso = () => new Date().toISOString();

export const genId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

// كود عالي الإنتروبيا بدون أحرف ملتبسة (0 O 1 I L) — آمن للتخمين-المقاوم
export function genTicketCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return `T-${out}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// تحليل قيمة حقل ملف مخصص «اسم|رابط» — يرجع null إن لم تكن مرجع ملف
export function parseFileRef(v: string): { name: string; url: string } | null {
  const i = v.indexOf("|");
  if (i <= 0) return null;
  const name = v.slice(0, i);
  const url = v.slice(i + 1);
  if (!/^https?:\/\//.test(url) && !url.startsWith("local://")) return null;
  return { name, url };
}
