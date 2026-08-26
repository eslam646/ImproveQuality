import { NextResponse } from "next/server";
import { processDueJobs } from "@/lib/worker";
import { getRepo } from "@/lib/db";
import { currentStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

// «نبضة المعالجة»: يدقها المتصفح بعد تحميل أي صفحة داخلية — طلب مستقل بميزانية
// استعلامات كاملة، فيرسل بريد الطابور فوراً دون المساس بطلب المستخدم الأصلي (كان يضرب 500).
// خفيفة وآمنة: للمسجلين فقط، دفعة صغيرة، وتستعيد العالق تلقائياً.
export async function POST() {
  const staff = await currentStaff();
  if (!staff) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const repo = await getRepo();
    await repo.jobsRecoverStuck(5); // العالق «قيد المعالجة» يعود للطابور
    const due = await repo.jobsDue(1);
    if (!due.length) return NextResponse.json({ ok: true, sent: 0 });
    const r = await processDueJobs(10);
    return NextResponse.json({ ok: true, sent: r.sent, remaining: (await repo.jobsDue(1)).length > 0 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 });
  }
}
