"use client";
import { useState } from "react";
import { fmtDate } from "@/lib/util";
import { useRouter } from "next/navigation";
import { addManualTeamsMeetingAction, cancelTeamsMeetingAction, createTeamsMeetingAction } from "@/app/actions/meetings";

export function TeamsMeetings({ code, defaultSubject, staff, meetings, canManage, canJoin, configured }: {
  code:string; defaultSubject:string; staff:{id:string;name:string;email:string;selected:boolean}[];
  meetings:{id:string;subject:string;starts_at:string;ends_at:string;join_url:string|null;status:string}[];
  canManage:boolean; canJoin:boolean; configured:boolean;
}) {
  const router=useRouter(); const [open,setOpen]=useState(false); const [mode,setMode]=useState<"manual"|"graph">("manual");
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  const [selected,setSelected]=useState(staff.filter(s=>s.selected).map(s=>s.id));
  const d=new Date(Date.now()+3600000); d.setSeconds(0,0); const localDefault=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-extrabold">🎥 اجتماعات Microsoft Teams</h3><p className="text-xs text-slate-500">رابط Teams + دعوات بريد + Audit Log</p></div>{canManage&&<button onClick={()=>setOpen(!open)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">+ إضافة اجتماع</button>}</div>
    {!configured&&canManage&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">✅ لصق رابط Teams يعمل فورًا بدون Microsoft Admin. الإنشاء التلقائي فقط يحتاج Graph.</div>}
    {open&&<form className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4" onSubmit={async e=>{
      e.preventDefault();setBusy(true);setError(null);const f=new FormData(e.currentTarget);
      const common={code,subject:String(f.get("subject")||""),startsAt:new Date(String(f.get("starts_at"))).toISOString(),durationMinutes:Number(f.get("duration")||30),staffIds:selected};
      const r=mode==="manual"?await addManualTeamsMeetingAction({...common,joinUrl:String(f.get("join_url")||"")}):await createTeamsMeetingAction(common);
      setBusy(false);if(!r.ok)setError(r.error||"فشل");else{setOpen(false);router.refresh();}
    }}>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-white p-1 text-xs font-bold"><button type="button" onClick={()=>setMode("manual")} className={`rounded-md px-3 py-2 ${mode==="manual"?"bg-indigo-600 text-white":"text-slate-500"}`}>🔗 لصق رابط Teams — بدون Admin</button><button type="button" onClick={()=>setMode("graph")} className={`rounded-md px-3 py-2 ${mode==="graph"?"bg-indigo-600 text-white":"text-slate-500"}`}>⚡ إنشاء تلقائي عبر Graph</button></div>
      {mode==="manual"&&<label className="block text-sm font-bold">رابط اجتماع Teams<input name="join_url" type="url" required placeholder="https://teams.microsoft.com/l/meetup-join/..." className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" dir="ltr"/><span className="mt-1 block text-xs font-normal text-slate-500">من Teams: New meeting ← Copy meeting link ← الصقه هنا</span></label>}
      {mode==="graph"&&!configured&&<p className="rounded bg-amber-50 p-2 text-xs font-bold text-amber-700">الإنشاء التلقائي غير متاح حتى ضبط Microsoft Entra. استخدم «لصق رابط» الآن.</p>}
      <label className="block text-sm font-bold">عنوان الاجتماع<input name="subject" defaultValue={defaultSubject} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"/></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm font-bold">الموعد<input name="starts_at" type="datetime-local" required defaultValue={localDefault} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"/></label><label className="text-sm font-bold">المدة<select name="duration" defaultValue="30" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"><option value="15">15 دقيقة</option><option value="30">30 دقيقة</option><option value="60">ساعة</option><option value="90">90 دقيقة</option><option value="120">ساعتان</option></select></label></div>
      <div><p className="mb-2 text-sm font-bold">المشاركون</p><div className="grid gap-1 sm:grid-cols-2">{staff.map(s=><label key={s.id} className="flex items-center gap-2 rounded bg-white p-2 text-xs"><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,s.id]:old.filter(x=>x!==s.id))}/><span><b>{s.name}</b><span className="block text-slate-400" dir="ltr">{s.email}</span></span></label>)}</div></div>
      {error&&<p className="rounded bg-rose-50 p-2 text-xs font-bold text-rose-700">{error}</p>}
      <button disabled={busy||(mode==="graph"&&!configured)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{busy?"جارٍ الحفظ والإرسال…":mode==="manual"?"حفظ الرابط وإرسال الدعوات":"إنشاء Teams وإرسال الدعوات"}</button>
    </form>}
    {meetings.length?<div className="space-y-2">{meetings.map(m=><div key={m.id} className="rounded-lg border bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><b className="text-sm">{m.subject}</b><p className="text-xs text-slate-500">{fmtDate(m.starts_at)} — {m.status==="cancelled"?"ملغي":"مجدول"}</p></div><div className="flex gap-2">{canJoin&&m.join_url&&m.status!=="cancelled"&&<a href={m.join_url} target="_blank" rel="noreferrer" className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">انضم إلى Teams ↗</a>}{canManage&&m.status!=="cancelled"&&<button onClick={async()=>{if(confirm("إلغاء الاجتماع؟")){const r=await cancelTeamsMeetingAction(m.id);if(!r.ok)setError(r.error||"فشل");else router.refresh();}}} className="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-700">إلغاء</button>}</div></div></div>)}</div>:<p className="rounded-lg border border-dashed p-4 text-center text-xs text-slate-400">لا توجد اجتماعات مرتبطة بهذه التذكرة</p>}
  </div>;
}
