import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getRepo } from "@/lib/db";
import { AUTH_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const { staff_id } = (await req.json()) as { staff_id?: string };
  const repo = await getRepo();
  const staff = staff_id ? await repo.staffGet(staff_id) : null;
  if (!staff || !staff.active) {
    return NextResponse.json({ error: "موظف غير موجود" }, { status: 404 });
  }
  const store = await cookies();
  store.set(AUTH_COOKIE, staff.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  await repo.settingsValueSet("demo_current_staff", staff.id);
  return NextResponse.json({ ok: true });
}
