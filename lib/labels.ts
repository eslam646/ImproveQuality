import type { AssignmentStatus, DevStatus, RequestType, Role, Ticket, TicketKind } from "./types";

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  new_development: "طلب تطوير جديد",
  change_request: "تعديل على طلب سابق",
  issue: "مشكلة / عطل",
};

export const TICKET_KIND_LABELS: Record<TicketKind, string> = {
  standard: "طلب عادي",
  instant_support: "دعم فوري",
};

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  unassigned: "غير مُسند",
  pending: "بانتظار الرد",
  accepted: "تم القبول",
  declined: "تم الرفض",
  reassigned: "أُعيد الإسناد",
  completed: "مكتمل",
};

export const STATUS_LABELS: Record<DevStatus, string> = {
  new: "جديد",
  handed_to_dev: "تم التسليم للديف",
  in_progress: "قيد التطوير",
  ready_for_test: "جاهز للاختبار",
  testing: "جاري الاختبار",
  test_passed: "اجتاز الاختبار",
  test_failed: "فشل الاختبار",
  needs_info: "بانتظار معلومات",
  fixed: "تم الإصلاح",
  closed: "مغلق",
  rejected: "مرفوض",
};

export const ALL_STATUSES = Object.keys(STATUS_LABELS) as DevStatus[];

export const FINAL_STATUSES: DevStatus[] = ["fixed", "closed", "rejected"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "مدير النظام",
  support: "مدخل بيانات / دعم",
  developer: "مطور",
  tester: "فريق الاختبار",
};

export const STATUS_COLORS: Record<DevStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  handed_to_dev: "bg-cyan-100 text-cyan-800",
  in_progress: "bg-amber-100 text-amber-800",
  ready_for_test: "bg-purple-100 text-purple-800",
  testing: "bg-fuchsia-100 text-fuchsia-800",
  test_passed: "bg-teal-100 text-teal-800",
  test_failed: "bg-red-100 text-red-800",
  needs_info: "bg-gray-200 text-gray-700",
  fixed: "bg-green-100 text-green-800",
  closed: "bg-slate-700 text-white",
  rejected: "bg-rose-100 text-rose-800",
};

// الانتقالات المسموحة لكل دور (مفروضة في الخادم)
// سير العمل الجديد: الطلب يبدأ عند التيست (جديد/بانتظار معلومات) ← التيست يسلّم للديف «تم التسليم للديف»
// ← الديف يبدأ «قيد التطوير» (يبدأ عدّاد تقديره) ← «جاهز للاختبار» ← التيست يبدأ «جاري الاختبار»
// (يبدأ عدّاد تقديره) ← اجتاز / فشل الاختبار
export function allowedTransitions(role: Role, current: DevStatus): DevStatus[] {
  const all = ALL_STATUSES.filter((s) => s !== current);
  if (role === "admin") return all;
  // مدخل البيانات View-only: يضيف ملاحظات فقط ولا يغيّر الحالة
  if (role === "support") return [];
  if (role === "tester") {
    // مرحلة الاستلام الأولي: يراجع البيانات — يعلّق الطلب أو يسلّمه للديف
    if (current === "new") return ["needs_info", "handed_to_dev"] as DevStatus[];
    if (current === "needs_info") return ["handed_to_dev", "new"] as DevStatus[];
    // مرحلة الاختبار: يبدأ عدّاد تقديره بـ«جاري الاختبار» ثم يحكم
    if (current === "ready_for_test") return ["testing"] as DevStatus[];
    if (current === "testing") return ["test_passed", "test_failed"] as DevStatus[];
    return [];
  }
  if (role === "developer") {
    // لا يبدأ إلا بعد تسليم التيست — «قيد التطوير» تبدأ عدّاد تقديره
    if (current === "handed_to_dev") return ["in_progress", "needs_info"] as DevStatus[];
    if (current === "in_progress") return ["ready_for_test", "needs_info"] as DevStatus[];
    // فشل الاختبار أو بانتظار معلومات → يستأنف العمل عليها
    if (current === "test_failed" || current === "needs_info") return ["in_progress"] as DevStatus[];
    return [];
  }
  return [];
}

// حالات تتطلب ملاحظة إجبارية تُرسل في الإيميل (سبب الرفض / سبب فشل الاختبار)
export const NOTE_REQUIRED_STATUSES: DevStatus[] = ["rejected", "test_failed"];

// ═══ الدعم الفوري «طلب جانبي» — حالته مشتقة من دورة حياته وليست حالة التطوير ═══
// المسار: بانتظار قبول التكليف ← (اعتذر؟ إعادة إسناد) ← جاري العمل ← تم الانتهاء
export function urgentStatusInfo(
  t: Pick<Ticket, "urgent_ended_at" | "urgent_started_at" | "tester_assignment_status" | "developer_assignment_status" | "tester_id" | "developer_id">,
): { label: string; color: string } {
  if (t.urgent_ended_at) return { label: "✅ تم الانتهاء — أُقفل رسمياً", color: "bg-emerald-100 text-emerald-800" };
  if (t.tester_assignment_status === "declined" && t.developer_assignment_status === "declined")
    return { label: "🙅 اعتذر التيست والديف — بانتظار إعادة الإسناد", color: "bg-rose-100 text-rose-800" };
  if (t.tester_assignment_status === "declined")
    return { label: "🙅 اعتذر التيست — بانتظار إعادة الإسناد", color: "bg-rose-100 text-rose-800" };
  if (t.developer_assignment_status === "declined")
    return { label: "🙅 اعتذر الديف — بانتظار إعادة الإسناد", color: "bg-rose-100 text-rose-800" };
  // إنهاء جزئي: طرف أنهى والآخر لم يُنهِ بعد — الإقفال الرسمي يتطلب الاثنين
  if (t.tester_id && t.developer_id) {
    if (t.tester_assignment_status === "completed" && t.developer_assignment_status !== "completed")
      return { label: "⏳ أنهى التيست — الإقفال بانتظار الديف", color: "bg-indigo-100 text-indigo-800" };
    if (t.developer_assignment_status === "completed" && t.tester_assignment_status !== "completed")
      return { label: "⏳ أنهى الديف — الإقفال بانتظار التيست", color: "bg-indigo-100 text-indigo-800" };
  }
  if (t.urgent_started_at || t.tester_assignment_status === "accepted" || t.developer_assignment_status === "accepted")
    return { label: "🔄 جاري العمل", color: "bg-blue-100 text-blue-800" };
  return { label: "⏳ بانتظار قبول التكليف", color: "bg-amber-100 text-amber-800" };
}
