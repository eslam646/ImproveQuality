"use client";

import { useState } from "react";
import { STATUS_LABELS, ALL_STATUSES } from "@/lib/labels";
import type { CustomFieldCfg, DevStatus, FormFieldCfg } from "@/lib/types";
import { CustomFileInput } from "@/components/custom-file-input";
import { parseFileRef } from "@/lib/util";

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

// عرض حقل مخصص (نص/نص طويل/رقم/قائمة/تاريخ/ملف) — يُستخدم في نموذج الضيوف
export function CustomFieldInput({ f }: { f: CustomFieldCfg }) {
  const name = `cf_${f.key}`;
  if (f.type === "file") {
    return <CustomFileInput f={f} />;
  }
  if (f.type === "textarea") {
    return <textarea name={name} required={f.required} rows={3} className={inputCls} placeholder={f.label} />;
  }
  if (f.type === "select") {
    return (
      <select name={name} required={f.required} className={inputCls} defaultValue="">
        <option value="" disabled>اختر…</option>
        {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  const type = f.type === "number" ? "number" : f.type === "date" ? "date" : "text";
  return <input name={name} type={type} required={f.required} className={inputCls} placeholder={f.label} />;
}

export function GuestSubmitForm({
  clients,
  fields,
  customFields = [],
}: {
  clients: { id: string; name: string }[];
  fields: FormFieldCfg[];
  customFields?: CustomFieldCfg[];
}) {
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<{ code: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [attState, setAttState] = useState<"idle" | "uploading" | "done" | "fail">("idle");

  const show = (k: string) => fields.find((f) => f.key === k)?.visible ?? true;
  const req = (k: string) => fields.find((f) => f.key === k)?.required ?? false;
  const labelOf = (k: string) => fields.find((f) => f.key === k)?.label ?? k;

  if (ok) {
    return (
      <div className="space-y-3 text-center">
        <div className="text-4xl">✅</div>
        <p className="font-bold text-green-700">تم استلام طلبك بنجاح</p>
        <p className="text-sm text-slate-600">احفظ كود التتبع الخاص بك:</p>
        <p className="rounded-lg bg-slate-900 py-3 font-mono text-xl font-bold text-white" dir="ltr">{ok.code}</p>
        {attState === "done" && <p className="text-sm font-semibold text-green-700">📎 تم رفع المرفق وربطه بالطلب ✓</p>}
        {attState === "fail" && <p className="text-sm font-semibold text-amber-700">⚠️ تعذر رفع المرفق — يمكنك إرساله لاحقاً لفريق الدعم مع ذكر الكود</p>}
        <div className="flex justify-center gap-2 text-sm">
          <a href={`/track?code=${ok.code}`} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700">تتبع حالة الطلب</a>
          <button className="rounded-lg bg-slate-200 px-4 py-2 font-semibold hover:bg-slate-300" onClick={() => { setOk(null); setClientId(""); setAttState("idle"); }}>طلب آخر</button>
        </div>
        <p className="text-xs text-slate-400">إن سجّلت بريدك الإلكتروني ستصلك الإشعارات تلقائياً عند كل تحديث.</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true); setErr(null);
        const f = e.target as HTMLFormElement;
        const fileInput = f.elements.namedItem("file") as HTMLInputElement | null;
        const file = fileInput?.files?.[0] ?? null;
        const body: Record<string, unknown> = {
          client_id: clientId && clientId !== "__other__" ? clientId : "",
          client_name: ((f.elements.namedItem("client_name") as HTMLInputElement | null)?.value ?? "").trim(),
          client_contact: ((f.elements.namedItem("client_contact") as HTMLInputElement | null)?.value ?? "").trim(),
          details: ((f.elements.namedItem("details") as HTMLTextAreaElement | null)?.value ?? "").trim(),
          custom: {},
        };
        // الحقول المخصصة الظاهرة للضيوف (cf_<key>)
        const custom: Record<string, string> = {};
        for (const cf of customFields) {
          const el = f.elements.namedItem(`cf_${cf.key}`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
          const v = (el?.value ?? "").trim();
          if (v) custom[cf.key] = v;
        }
        body.custom = custom;
        try {
          const res = await fetch("/api/public/submit", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
          });
          const j = await res.json();
          if (!res.ok) { setErr(j.error || "حدث خطأ — حاول مجدداً"); setLoading(false); return; }
          // المرحلة الثانية: رفع المرفق وربطه بالكود (إن اختار ملفاً)
          if (file && show("attachment")) {
            setAttState("uploading");
            try {
              const fd = new FormData();
              fd.set("code", j.code);
              fd.set("file", file);
              const ar = await fetch("/api/attachments/upload", { method: "POST", body: fd });
              setAttState(ar.ok ? "done" : "fail");
            } catch { setAttState("fail"); }
          }
          setOk({ code: j.code });
        } catch {
          setErr("مشكلة اتصال — حاول مجدداً");
        }
        setLoading(false);
      }}
    >
      {show("client") && (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">{labelOf("client")}{req("client") ? " *" : ""}</span>
          {clients.length > 0 ? (
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required={req("client")}
              className={inputCls}
            >
              <option value="" disabled>اختر من القائمة…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__other__">✏️ غير موجود بالقائمة — أكتبه بنفسي</option>
            </select>
          ) : null}
          {(clients.length === 0 || clientId === "__other__") && (
            <input
              name="client_name"
              minLength={2}
              required={req("client")}
              className={`${inputCls} ${clients.length ? "mt-2" : ""}`}
              placeholder="اسمك أو اسم شركتك"
            />
          )}
        </label>
      )}
      {show("client_contact") && (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">{labelOf("client_contact")}{req("client_contact") ? " *" : ""}</span>
          <span className="mb-1 block text-xs text-slate-400">بإدخال بريدك ستصلك إشعارات تحديث الحالة تلقائياً</span>
          <input name="client_contact" required={req("client_contact")} className={inputCls} placeholder="you@example.com" />
        </label>
      )}
      {show("details") && (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">{labelOf("details")}{req("details") ? " *" : ""}</span>
          <textarea name="details" required={req("details")} minLength={5} rows={5} className={inputCls} placeholder="اشرح مشكلتك بالتفصيل…" />
        </label>
      )}
      {customFields.map((cf) => (
        <label key={cf.key} className="block">
          <span className="mb-1 block text-sm font-semibold">{cf.label}{cf.required ? " *" : ""}</span>
          <CustomFieldInput f={cf} />
        </label>
      ))}
      {show("attachment") && (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">{labelOf("attachment")}{req("attachment") ? " *" : ""}</span>
          <span className="mb-1 block text-xs text-slate-400">صورة أو ملف يوضح المشكلة — حتى 4 ميجابايت</span>
          <input name="file" type="file" required={req("attachment")} className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm file:ml-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-blue-700" />
        </label>
      )}
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p>}
      <button disabled={loading} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50">
        {loading ? (attState === "uploading" ? "جارٍ رفع المرفق…" : "جارٍ الإرسال…") : "إرسال الطلب 📨"}
      </button>
    </form>
  );
}

interface TrackResult {
  code: string;
  status_label: string;
  last_status_change?: string;
  client_name?: string;
  developer_name?: string | null;
  estimation?: { days: number | null; hours: number | null };
  custom?: { label: string; value: string; file?: boolean }[];
  timeline?: { status_label: string; at: string }[];
}

export function TrackForm({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<TrackResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const lookup = async (c: string) => {
    setLoading(true); setErr(null); setRes(null);
    const r = await fetch(`/api/track?code=${encodeURIComponent(c)}`);
    const j = await r.json();
    setLoading(false);
    if (r.ok) setRes(j);
    else setErr(j.error || "غير موجود");
  };

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (code.trim()) lookup(code.trim()); }}
      >
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="T-XXXXXXXX" dir="ltr" className={`${inputCls} font-mono`} />
        <button disabled={loading} className="rounded-lg bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? "…" : "استعلام"}
        </button>
      </form>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p>}
      {res && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4">
            <span className="font-mono font-bold" dir="ltr">{res.code}</span>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-800">{res.status_label}</span>
          </div>
          {(res.client_name || res.developer_name || res.last_status_change || res.estimation) && (
            <div className="space-y-1 rounded-lg border border-slate-100 bg-white p-4 text-sm">
              {res.client_name && <p><span className="font-bold text-slate-500">العميل: </span>{res.client_name}</p>}
              {res.developer_name && <p><span className="font-bold text-slate-500">المطور المسند: </span>{res.developer_name}</p>}
              {res.estimation && (
                <p><span className="font-bold text-slate-500">⏱️ التقدير الزمني: </span>
                  {res.estimation.days ? `${res.estimation.days} يوم` : ""}{res.estimation.days && res.estimation.hours ? " + " : ""}{res.estimation.hours ? `${res.estimation.hours} ساعة` : ""}
                </p>
              )}
              {res.last_status_change && (
                <p><span className="font-bold text-slate-500">آخر تحديث للحالة: </span>{new Date(res.last_status_change).toLocaleString("ar-EG")}</p>
              )}
            </div>
          )}
          {res.custom && res.custom.length > 0 && (
            <div className="space-y-1 rounded-lg border border-slate-100 bg-white p-4 text-sm">
              {res.custom.map((c, i) => {
                const ref = c.file ? parseFileRef(c.value) : null;
                return (
                  <p key={i}>
                    <span className="font-bold text-slate-500">{c.label}: </span>
                    {ref && ref.url.startsWith("http")
                      ? <a href={ref.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">📎 {ref.name}</a>
                      : ref ? <span>📎 {ref.name}</span> : <span>{c.value}</span>}
                  </p>
                );
              })}
            </div>
          )}
          {res.timeline && (
            <div>
              <p className="mb-2 text-sm font-bold text-slate-600">مسار الحالة:</p>
              <ol className="space-y-2 border-r-2 border-slate-200 pr-4">
                {res.timeline.map((t, i) => (
                  <li key={i} className="text-sm">
                    <b>{t.status_label}</b>
                    <span className="mr-2 text-xs text-slate-400">{new Date(t.at).toLocaleString("ar-EG")}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PublicUpdateForm({ code, currentStatus }: { code: string; currentStatus: DevStatus }) {
  const [status, setStatus] = useState<DevStatus | "">("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (ok) {
    return (
      <div className="space-y-3 text-center">
        <div className="text-4xl">🎉</div>
        <p className="font-bold text-green-700">تم تحديث الحالة بنجاح</p>
        <p className="text-sm text-slate-500">أُرسلت الإشعارات تلقائياً إلى المعنيين بالتذكرة (المدخّل + المطور + المدير)</p>
        <a href={`/track?code=${code}`} className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">عرض حالة الطلب</a>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true); setErr(null);
        const res = await fetch("/api/public/update-status", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, dev_status: status, note }),
        });
        const j = await res.json();
        setLoading(false);
        if (res.ok) setOk(true);
        else setErr(j.error || "تعذر التحديث");
      }}
    >
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">الحالة الجديدة * (الحالية: {STATUS_LABELS[currentStatus]})</span>
        <select required value={status} onChange={(e) => setStatus(e.target.value as DevStatus)} className={inputCls}>
          <option value="" disabled>اختر الحالة…</option>
          {ALL_STATUSES.filter((s) => s !== currentStatus).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">ملاحظة (اختياري — تُدرج في إيميل الإشعار)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputCls} placeholder="مثال: تم الإصلاح وجاري النشر على السيرفر…" />
      </label>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p>}
      <button disabled={loading || !status} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50">
        {loading ? "جارٍ التحديث…" : "تأكيد تحديث الحالة ✓"}
      </button>
    </form>
  );
}
