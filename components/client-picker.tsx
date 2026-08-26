"use client";

import { useState } from "react";

// اختيار العميل: قائمة مسجلة أو اسم حر — الإلزام يتحقق بأي منهما (مش القائمة بس):
// كتابة اسم جديد تلغي required من القائمة تلقائياً، والعكس — والسيرفر يتحقق النهائي
export function ClientPicker({
  clients,
  required,
  selectCls,
  inputCls,
}: {
  clients: { id: string; name: string }[];
  required: boolean;
  selectCls: string;
  inputCls: string;
}) {
  const [selected, setSelected] = useState("");
  const [typed, setTyped] = useState("");

  return (
    <>
      <select
        name="client_id"
        required={required && typed.trim().length < 2}
        className={selectCls}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">— اختر العميل —</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input
        name="client_name"
        className={`${inputCls} mt-2`}
        placeholder="أو اكتب اسم عميل جديد غير مسجل"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      {required && typed.trim().length >= 2 && !selected && (
        <p className="mt-1 text-xs font-semibold text-emerald-700">✓ سيُسجل الطلب باسم العميل الجديد «{typed.trim()}»</p>
      )}
    </>
  );
}
