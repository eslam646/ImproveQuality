import type { AssignmentStatus, DevStatus, RequestType, Role, TicketKind } from "./types";

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
  in_progress: "قيد التطوير",
  ready_for_test: "جاهز للاختبار",
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
  in_progress: "bg-amber-100 text-amber-800",
  ready_for_test: "bg-purple-100 text-purple-800",
  test_passed: "bg-teal-100 text-teal-800",
  test_failed: "bg-red-100 text-red-800",
  needs_info: "bg-gray-200 text-gray-700",
  fixed: "bg-green-100 text-green-800",
  closed: "bg-slate-700 text-white",
  rejected: "bg-rose-100 text-rose-800",
};

// الانتقالات المسموحة لكل دور (مفروضة في الخادم)
// سير العمل: التيست يستلم أولاً ← يسلّم للديف ← الديف ينجز ويعيد للتيست ← التيست يعتمد أو يُرجع بمشكلة
export function allowedTransitions(role: Role, current: DevStatus): DevStatus[] {
  const all = ALL_STATUSES.filter((s) => s !== current);
  if (role === "admin" || role === "support") return all;
  if (role === "tester")
    return current === "ready_for_test"
      ? (["test_passed", "test_failed"] as DevStatus[])
      : [];
  if (role === "developer") {
    if (current === "in_progress") return ["ready_for_test", "needs_info"] as DevStatus[];
    // فشل الاختبار أو بانتظار معلومات → يستأنف العمل عليها
    if (current === "test_failed" || current === "needs_info") return ["in_progress"] as DevStatus[];
    return [];
  }
  return [];
}

// حالات تتطلب ملاحظة إجبارية تُرسل في الإيميل (سبب الرفض / سبب فشل الاختبار)
export const NOTE_REQUIRED_STATUSES: DevStatus[] = ["rejected", "test_failed"];
