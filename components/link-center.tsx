"use client";

import { useState } from "react";
import { togglePublicLinkAction } from "@/app/actions/admin";

type LinkKey = "allow_guest_submit" | "allow_track" | "allow_public_update";

export function LinkCenter({
  baseUrl, allowGuestSubmit, allowTrack, allowPublicUpdate,
}: {
  baseUrl: string;
  allowGuestSubmit: boolean;
  allowTrack: boolean;
  allowPublicUpdate: boolean;
}) {
  const [state, setState] = useState({ allow_guest_submit: allowGuestSubmit, allow_track: allowTrack, allow_public_update: allowPublicUpdate });
  const [ticketCode, setTicketCode] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, url: string) => {
    try { await navigator.clipboard.writeText(url); }
    catch { prompt("انسخ الرابط يدوياً:", url); }
    setCopied(label);
    setTimeout(() => setCopied(null), 1800);
  };

  const rows: { key: LinkKey; title: string; desc: string; url: string | null }[] = [
    {
      key: "allow_guest_submit", title: "نموذج استقبال الطلبات",
      desc: "يرسله لعملائك — يقدّمون طلبات بلا دخول ويستلمون كود تتبع",
      url: `${baseUrl}/submit`,
    },
    {
      key: "allow_track", title: "صفحة الاستعلام والتتبع",
      desc: "قراءة فقط — يدخل العميل كوده ويرى حالة طلبه (بالمحتوى الذي تحدده أسفل)",
      url: `${baseUrl}/track`,
    },
    {
      key: "allow_public_update", title: "نموذج تحديث الحالة بالكود",
      desc: "معبّأ مسبقاً — أرسله للمطور الخارجي أو العميل ليحدّث حالة تذكرة محددة بكودها",
      url: null, // يُبنى بالكود أدناه
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        روابط عامة لا تحتاج تسجيل دخول — انسخها وأرسلها لأي شخص (واتساب/إيميل). أي رابط تقفله يتوقف فوراً.
        أما باقي صفحات النظام فتتطلب دخول الموظف برقمه السري دائماً.
      </p>
      <div className="space-y-2">
        {rows.map((r) => {
          const on = state[r.key];
          return (
            <div key={r.key} className={`rounded-xl border p-3 ${on ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-70"}`}>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={async () => {
                    const next = !on;
                    setState((s) => ({ ...s, [r.key]: next }));
                    await togglePublicLinkAction(r.key, next);
                  }}
                  className={`relative h-6 w-11 rounded-full transition ${on ? "bg-green-500" : "bg-slate-300"}`}
                  title={on ? "مفعّل — اضغط للإيقاف" : "موقوف — اضغط للتفعيل"}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "right-0.5" : "left-0.5"}`} />
                </button>
                <div className="min-w-48 flex-1">
                  <b className="text-sm">{r.title}</b>
                  <p className="text-xs text-slate-400">{r.desc}</p>
                </div>
                {r.url && (
                  <>
                    <code dir="ltr" className="max-w-56 truncate rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{r.url}</code>
                    <button
                      onClick={() => copy(r.key, r.url!)}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                    >
                      {copied === r.key ? "✓ تم النسخ" : "📋 نسخ الرابط"}
                    </button>
                  </>
                )}
                {!on && <span className="text-xs font-bold text-rose-500">موقوف حالياً</span>}
              </div>
              {r.key === "allow_public_update" && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                  <span className="text-xs font-semibold text-slate-500">ولّد رابط تحديث لتذكرة محددة:</span>
                  <input
                    value={ticketCode}
                    onChange={(e) => setTicketCode(e.target.value)}
                    placeholder="T-XXXXXXXX"
                    dir="ltr"
                    className="w-36 rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                  />
                  <button
                    disabled={ticketCode.trim().length < 6}
                    onClick={() => copy("upd", `${baseUrl}/update-form?code=${encodeURIComponent(ticketCode.trim())}`)}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-40"
                  >
                    {copied === "upd" ? "✓ تم النسخ" : "توليد ونسخ 📋"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
