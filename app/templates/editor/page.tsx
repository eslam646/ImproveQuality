import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { TemplateEditor } from "@/components/template-editor";
import { DEFAULT_TEMPLATE_BLOCKS } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TemplateEditorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff(["admin"]);
  const sp = await searchParams;
  const repo = await getRepo();
  const template = sp.id ? await repo.templateGet(sp.id) : null;
  if (sp.id && !template) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-2xl font-extrabold">{template ? `تحرير قالب: ${template.name}` : "قالب بريد جديد"}</h1>
      <TemplateEditor
        id={template?.id ?? null}
        initialName={template?.name ?? ""}
        initialSubject={template?.subject ?? ""}
        initialBody={template?.body_html ?? ""}
        initialBlocks={template?.blocks ?? DEFAULT_TEMPLATE_BLOCKS}
      />
    </div>
  );
}
