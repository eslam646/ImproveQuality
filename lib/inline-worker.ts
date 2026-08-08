import { processAll } from "./worker";

/**
 * عامل داخلي يعيش داخل سيرفر Next نفسه.
 * الفائدة: حتى لو الساندبوكس أعاد تشغيل نفسه وأنعش السيرفر فقط،
 * إرسال الإيميلات والتذكيرات المجدولة تفضل شغالة بدون عملية منفصلة.
 * الحارس (singleton) يمنع التكرار مع إعادة التحميل السريع في وضع التطوير.
 */

declare global {
  // eslint-disable-next-line no-var
  var __inlineWorkerStarted: boolean | undefined;
}

export function startInlineWorker() {
  if (global.__inlineWorkerStarted) return;
  global.__inlineWorkerStarted = true;

  const tick = async () => {
    try {
      await processAll();
    } catch {
      // تجاهل الأخطاء العابرة — المحاولة القادمة بعد 15 ثانية
    }
  };

  setTimeout(tick, 5_000);
  const iv = setInterval(tick, 15_000);
  (iv as unknown as { unref?: () => void }).unref?.();

  console.log("⚙️  العامل الداخلي يعمل — معالجة طابور الإيميلات كل 15 ثانية");
}
