export const dynamic = "force-dynamic";

// تحويل الصفحة الرئيسية للوحة التحكم بدون redirect() —
// أسلوب meta refresh + سكربت + رابط يدوي يعمل في كل بيئات التشغيل (Node/Workers) بلا استثناءات
export default function Home() {
  return (
    <div className="grid min-h-[70vh] place-items-center">
      <meta httpEquiv="refresh" content="0;url=/dashboard" />
      <script dangerouslySetInnerHTML={{ __html: "location.replace('/dashboard');" }} />
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-3 text-4xl">🎫</div>
        <p className="mb-4 font-bold text-slate-700">بوابة الدعم الفني</p>
        <p className="text-sm text-slate-500">
          جاري تحويلك للوحة التحكم…{" "}
          <a href="/dashboard" className="font-bold text-blue-700 hover:underline">اضغط هنا إن لم تُحوَّل تلقائياً</a>
        </p>
      </div>
    </div>
  );
}
