import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { RuleBuilder } from "@/components/rule-builder";

export const dynamic = "force-dynamic";

export default async function RuleEditorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff(["admin"]);
  const sp = await searchParams;
  const repo = await getRepo();
  const [staff, templates, rules] = await Promise.all([
    repo.staffList(true), repo.templateList(), repo.rulesList(),
  ]);
  const rule = sp.id ? rules.find((r) => r.id === sp.id) : undefined;
  if (sp.id && !rule) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-extrabold">{rule ? `تحرير قاعدة: ${rule.name}` : "قاعدة أتمتة جديدة"}</h1>
      <RuleBuilder
        initial={rule ?? null}
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        staff={staff.map((s) => ({ id: s.id, name: s.name, role: s.role }))}
      />
    </div>
  );
}
