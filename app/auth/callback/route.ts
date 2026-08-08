import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicOrigin } from "@/lib/public-url";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const base = publicOrigin(req);
  if (!code) return NextResponse.redirect(`${base}/login`);

  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cs: { name: string; value: string; options?: unknown }[]) {
        cs.forEach(({ name, value, options }) => {
          try { cookieStore.set(name, value, options as never); } catch { /* تجاهل */ }
        });
      },
    },
  });
  await supabase.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(`${base}/dashboard`);
}
