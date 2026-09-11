import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { notFound } from "next/navigation";
import { assessmentById } from "@/lib/assessments/catalog";
import { listCompleted } from "@/lib/assessments/store";
import { AssessmentRunner } from "@/components/AssessmentRunner";
import { saveAssessmentAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function RunAssessmentPage({ params }: { params: Promise<{ templateId: string }> }) {
  await requireSectionAccess("operations", "view");

  const { templateId } = await params;
  const template = assessmentById(templateId);
  if (!template) notFound();

  const history = listCompleted(templateId).slice(0, 6).map((a) => ({ id: a.id, subject: a.subject, result: a.result.result, overallPct: a.result.overallPct, createdAt: a.createdAt }));

  return (
    <div>
      <header className="mb-5">
        <Link href="/assessments" className="text-sm text-slate-500 hover:text-slate-800">← Assessments</Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{template.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{template.description}</p>
      </header>

      <AssessmentRunner template={template} history={history} saveAction={saveAssessmentAction} />
    </div>
  );
}
