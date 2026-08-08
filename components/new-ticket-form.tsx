"use client";

import { useState } from "react";
import { createTicketAction } from "@/app/actions/tickets";
import { Button, Field, inputCls, selectCls } from "@/components/ui";
import type { FormFieldCfg } from "@/lib/types";

interface Props {
  clients: { id: string; name: string; contact: string | null }[];
  devs: { id: string; name: string }[];
  support: { id: string; name: string }[];
  currentUserId: string;
  cfg: FormFieldCfg[];
}

const OTHER = "__other__";

export function NewTicketForm({ clients, devs, support, currentUserId, cfg }: Props) {
  const show = (k: string) => cfg.find((f) => f.key === k)?.visible ?? true;
  const need = (k: string) => cfg.find((f) => f.key === k)?.required ?? false;

  const [clientId, setClientId] = useState(clients[0]?.id ?? OTHER);
  const chosen = clients.find((c) => c.id === clientId);
  const [contact, setContact] = useState(chosen?.contact ?? "");

  return (
    <form action={createTicketAction} className="space-y-5">
      {show("client") && (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={`العميل ${need("client") ? "*" : ""}`} hint="اختار من قائمة عملائك — تُدار من صفحة الموظفون والعملاء">
            <select
              name="client_id" required={need("client")} value={clientId}
              className={selectCls}
              onChange={(e) => {
                setClientId(e.target.value);
                const c = clients.find((x) => x.id === e.target.value);
                if (c?.contact) setContact(c.contact);
              }}
            >
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value={OTHER}>✍️ عميل آخر (اكتب الاسم يدوياً)…</option>
            </select>
          </Field>
          {clientId === OTHER && (
            <Field label="اسم العميل يدوياً *">
              <input name="client_name" required className={inputCls} placeholder="اكتب اسم العميل الجديد" />
            </Field>
          )}
        </div>
      )}

      {show("client_contact") && (
        <Field label={`وسيلة تواصل العميل ${need("client_contact") ? "*" : ""}`} hint="بريد إلكتروني → يصله إشعار تلقائي عند كل تحديث">
          <input name="client_contact" required={need("client_contact")} className={inputCls}
            value={contact} onChange={(e) => setContact(e.target.value)} placeholder="client@example.com أو رقم هاتف" />
        </Field>
      )}

      <Field label={`تفاصيل الطلب ${need("details") ? "*" : ""}`}>
        <textarea name="details" required={need("details")} rows={5} className={inputCls} placeholder="اشرح المشكلة أو الطلب بالتفصيل…" />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        {show("developer") && (
          <Field label={`إسناد إلى مطور ${need("developer") ? "*" : ""}`} hint="إيميل للمطور + CC لك ولمديره فوراً">
            <select name="developer_id" required={need("developer")} className={selectCls} defaultValue="">
              <option value="">— بدون إسناد الآن —</option>
              {devs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="مسجّل باسم (مدخّل البيانات)" hint="قائمة موظفي الدعم — الافتراضي أنت">
          <select name="creator_id" className={selectCls} defaultValue={currentUserId}>
            {support.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
        <Button type="submit">إنشاء الطلب ✓</Button>
        <span className="text-xs text-slate-500">بعد الإنشاء يمكنك رفع المرفقات من صفحة التذكرة مباشرة</span>
      </div>
    </form>
  );
}
