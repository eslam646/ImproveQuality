import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@/lib/auth";

export async function POST() {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
  if (process.env.AUTH_MODE === "supabase") {
    const res = NextResponse.json({ ok: true });
    // إزالة كوكيز supabase (sb-*) إن وجدت
    for (const c of store.getAll()) {
      if (c.name.startsWith("sb-")) res.cookies.set(c.name, "", { maxAge: 0, path: "/" });
    }
    return res;
  }
  return NextResponse.json({ ok: true });
}
