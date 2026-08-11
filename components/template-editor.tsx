"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteTemplateAction, previewTemplateAction, upsertTemplateAction } from "@/app/actions/admin";
import { BLOCK_LABELS } from "@/lib/templates";
import type { TemplateBlocks } from "@/lib/types";

const VARS = [
  "{{ticket.code}}", "{{ticket.client_name}}", "{{ticket.title}}", "{{ticket.request_type}}",
  "{{ticket.ticket_kind}}", "{{ticket.priority}}", "{{ticket.created_by_name}}", "{{ticket.tester_name}}",
  "{{ticket.developer_name}}", "{{ticket.estimation}}", "{{ticket.affected_service}}", "{{status_label}}",
  "{{old_status_label}}", "{{note}}", "{{track_url}}", "{{app_name}}",
];

export function TemplateEditor({ id, initialName, initialSubject, initialBody, initialBlocks }: {
  id: string | null; initialName: string; initialSubject: string; initialBody: string;
  initialBlocks: TemplateBlocks;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [blocks, setBlocks] = useState<TemplateBlocks>(initialBlocks);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (k: keyof TemplateBlocks) => setBlocks((b) => ({ ...b, [k]: !b[k] }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={name} placeholder="اسم القالب" onChange={(e) => setName(e.target.value)} />
        <div>
          <p className="mb-1 text-xs font-bold text-slate-500">الموضوع (يدعم المتغيرات):</p>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="تحديث حالة {{code}}" />
        </div>
        <div>
          <p className="mb-1 text-xs font-bold text-slate-500">نص تمهيدي اختياري (يظهر أعلى الإيميل — يدعم المتغيرات):</p>
          <textarea className="h-28 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs" dir="ltr" value={body} onChange={(e) => setBody(e.target.value)} placeholder="مرحباً، نُعلمكم بأن الطلب {{code}} …" />
        </div>
        <div className="flex flex-wrap gap-1">
          {VARS.map((v) => (
            <button key={v} type="button" className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] hover:bg-blue-100"
              onClick={() => setBody((b) => b + v)} dir="ltr">{v}</button>
          ))}
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
          <p className="mb-2 text-xs font-bold text-blue-900">
            الأقسام التلقائية للإيميل — فعّل ما يظهر وأطفئ ما يختفي (المحتوى يُبنى من بيانات التذكرة):
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {(Object.keys(BLOCK_LABELS) as (keyof TemplateBlocks)[]).map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-sm shadow-sm">
                <input type="checkbox" checked={blocks[k]} onChange={() => toggle(k)} className="h-4 w-4 accent-blue-600" />
                <span className={blocks[k] ? "font-semibold" : "text-slate-400 line-through"}>{BLOCK_LABELS[k]}</span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
        <div className="flex gap-2">
          <button disabled={busy} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={async () => {
              setBusy(true); setError(null);
              const r = await upsertTemplateAction({ ...(id ? { id } : {}), name, subject, body_html: body, blocks });
              setBusy(false);
              if (r.ok) { router.push("/templates"); router.refresh(); } else setError(r.error ?? "خطأ");
            }}>
            {busy ? "…" : "حفظ ✓"}
          </button>
          <button className="rounded-lg bg-slate-200 px-5 py-2 text-sm font-bold hover:bg-slate-300"
            onClick={async () => {
              const p = await previewTemplateAction(subject, body, blocks);
              setPreview(p.html);
            }}>
            معاينة ببيانات حقيقية 👁
          </button>
          {id && (
            <button className="rounded-lg bg-rose-100 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-200"
              onClick={async () => {
                if (confirm("حذف القالب؟ القواعد المرتبطة به ستفشل.")) { await deleteTemplateAction(id); router.push("/templates"); router.refresh(); }
              }}>حذف</button>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-bold text-slate-500">المعاينة (كما ستصل في البريد):</p>
        {preview ? (
          <iframe title="preview" className="h-[520px] w-full rounded-lg bg-white" sandbox="" srcDoc={preview} />
        ) : (
          <div className="flex h-[520px] items-center justify-center text-sm text-slate-400">اضغط «معاينة» لعرض النتيجة</div>
        )}
      </div>
    </div>
  );
}
