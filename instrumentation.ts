export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startInlineWorker } = await import("./lib/inline-worker");
    startInlineWorker();
  }
}
