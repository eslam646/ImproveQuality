import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ماجيك لينك الدخول (AUTH_MODE=supabase فقط)
export async function POST(req: Request) {
  if (process.env.AUTH_MODE !== "supabase") {
    return NextResponse.json({ error: "وضع Supabase غير مفعّل" }, { status: 400 });
  }
  const { email } = (await req.json()) as { email?: string };
  if (!email) return NextResponse.json({ error: "البريد مطلوب" }, { status: 400 });

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${base}/auth/callback` },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
