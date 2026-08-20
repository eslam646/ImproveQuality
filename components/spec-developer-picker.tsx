"use client";

import { useState } from "react";

// قائمة المطورين المفلترة حسب التخصص المختار:
// من حدد له الأدمن تخصصات يظهر تحت تخصصه فقط — ومن بلا تخصصات يظهر في كل القوائم
export function SpecDeveloperPicker({
  specs,
  devs,
}: {
  specs: { key: string; label: string }[];
  devs: { id: string; name: string; specializations: string[] | null }[];
}) {
  const [specKey, setSpecKey] = useState(specs[0]?.key ?? "");
  const matching = devs.filter((d) => !d.specializations?.length || d.specializations.includes(specKey));
  const others = devs.filter((d) => d.specializations?.length && !d.specializations.includes(specKey));

  return (
    <span className="flex flex-wrap gap-2">
      {/* التخصص — الحقل الفعلي المرسل */}
      <select
        name="spec_key"
        required
        value={specKey}
        onChange={(e) => setSpecKey(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        {specs.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
      </select>
      {/* المطور — يتصفى حسب التخصص */}
      <select name="staff_id" required defaultValue="" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
        <option value="" disabled>اختر…</option>
        {matching.length > 0 && (
          <optgroup label="مطابقون للتخصص">
            {matching.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </optgroup>
        )}
        {others.length > 0 && (
          <optgroup label="تخصصات أخرى (اختيار استثنائي)">
            {others.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </optgroup>
        )}
      </select>
    </span>
  );
}
