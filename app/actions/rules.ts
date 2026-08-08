"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import type { Action, AutomationRule, Condition, TriggerType } from "@/lib/types";

export async function upsertRuleAction(input: {
  id?: string;
  name: string;
  trigger_type: TriggerType;
  trigger_field: string | null;
  conditions: Condition[];
  actions: Action[];
  enabled: number;
}): Promise<{ ok: boolean; error?: string }> {
  await requireStaff(["admin"]);
  if (!input.name.trim()) return { ok: false, error: "اسم القاعدة مطلوب" };
  if (!input.actions.length) return { ok: false, error: "أضف إجراءً واحداً على الأقل" };
  const repo = await getRepo();
  await repo.ruleUpsert(input);
  revalidatePath("/automation");
  return { ok: true };
}

export async function toggleRuleAction(id: string, enabled: number) {
  await requireStaff(["admin"]);
  const repo = await getRepo();
  const all = await repo.rulesList();
  const r = all.find((x) => x.id === id);
  if (r) await repo.ruleUpsert({ ...r, enabled });
  revalidatePath("/automation");
}

export async function deleteRuleAction(id: string) {
  await requireStaff(["admin"]);
  const repo = await getRepo();
  await repo.ruleDelete(id);
  revalidatePath("/automation");
}

export async function listRulesAction(): Promise<AutomationRule[]> {
  await requireStaff(["admin"]);
  const repo = await getRepo();
  return repo.rulesList();
}
