import { Copy, Star } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { QuickCreate } from "@/components/tasks/quick-create";
import { DeleteTemplateButton } from "@/components/templates/delete-template-button";
import { TemplateFormDialog } from "@/components/templates/template-form-dialog";
import { todayInAppZone } from "@/domain/dates";
import { isAssignableProject, projectSuffix } from "@/domain/project";
import { defaultDeadline } from "@/domain/task";
import { templateTaskValues } from "@/domain/template";
import { requireAuth } from "@/server/auth";
import { listCategories } from "@/server/data/categories";
import { listProjects } from "@/server/data/projects";
import { getSettings } from "@/server/data/settings";
import { listTemplates } from "@/server/data/templates";

export const metadata: Metadata = { title: "תבניות · לוח בקרה" };

const TEMPLATES_LIST_ID = "templates-list";

export default function TemplatesPage() {
  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-6">
      <Suspense fallback={<TemplatesSkeleton />}>
        <TemplatesContent />
      </Suspense>
    </div>
  );
}

async function TemplatesContent() {
  const auth = await requireAuth();
  const today = todayInAppZone();
  const [templates, projects, categories, settings] = await Promise.all([
    listTemplates(auth),
    listProjects(auth, { includeArchived: true }),
    listCategories(auth),
    getSettings(auth),
  ]);
  const activeProjects = projects.filter(isAssignableProject).map(({ id, name }) => ({ id, name }));
  const activeProjectIds = new Set(activeProjects.map((project) => project.id));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  return (
    <>
      <PageHeader title="תבניות">
        <TemplateFormDialog projects={activeProjects} categories={categories} />
      </PageHeader>
      <p className="max-w-prose text-text-secondary">
        כל שימוש בתבנית יוצר משימה חדשה ועצמאית. שינוי או מחיקה של תבנית לא משנים משימות שכבר נוצרו ממנה.
      </p>

      {/* Focus lands here after a delete, whether or not templates remain. */}
      <div id={TEMPLATES_LIST_ID} tabIndex={-1} className="outline-none">
        {templates.length === 0 ? (
          <EmptyState
            icon={Copy}
            title="עדיין אין תבניות."
            description="תבנית שומרת משימה שחוזרת על עצמה, כמו דוח שבועי. אפשר ליצור אחת מהכפתור תבנית חדשה."
          />
        ) : (
          <ul aria-label="רשימת התבניות" className="flex flex-col rounded-xl border bg-surface">
            {templates.map((template) => {
              const project = template.projectId ? projectById.get(template.projectId) : undefined;
              const suffix = project ? projectSuffix(project) : "";
              const categoryName = template.categoryId ? categoryNames.get(template.categoryId) : undefined;
              const instance = templateTaskValues(template, {
                today,
                horizonDays: settings.defaultDeadlineDays,
                activeProjectIds,
              });
              return (
                <li
                  key={template.id}
                  id={`template-${template.id}`}
                  className="flex scroll-mt-6 flex-col gap-3 border-b px-4 py-3 last:border-b-0 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-semibold wrap-anywhere">
                      <bdi>{template.name}</bdi>
                    </p>
                    <p className="text-text-secondary wrap-anywhere">
                      משימה: <bdi>{template.title}</bdi>
                    </p>
                    {project || categoryName || template.isImportant ? (
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                        {project ? (
                          <span>
                            <span className="sr-only">פרויקט: </span>
                            <bdi>{project.name}</bdi>
                            {suffix}
                          </span>
                        ) : null}
                        {categoryName ? (
                          <span>
                            <span className="sr-only">קטגוריה: </span>
                            <bdi>{categoryName}</bdi>
                          </span>
                        ) : null}
                        {template.isImportant ? (
                          <span className="inline-flex items-center gap-1">
                            <Star aria-hidden className="size-4 shrink-0" />
                            חשובה
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <QuickCreate
                      today={today}
                      defaultDeadline={defaultDeadline(today, settings.defaultDeadlineDays)}
                      categories={categories}
                      projects={activeProjects}
                      fromTemplate={{ name: template.name, values: instance.values, projectDropped: instance.projectDropped }}
                    />
                    <TemplateFormDialog
                      template={{ ...template, projectName: project?.name, projectSuffix: suffix }}
                      projects={activeProjects}
                      categories={categories}
                    />
                    <DeleteTemplateButton templateId={template.id} name={template.name} focusAfterId={TEMPLATES_LIST_ID} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function TemplatesSkeleton() {
  return (
    <>
      <PageHeader title="תבניות" />
      <div role="status" aria-busy="true" aria-label="טוען תבניות" className="flex flex-col rounded-xl border bg-surface">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex min-h-16 flex-col justify-center gap-2 border-b px-4 last:border-b-0">
            <div className="h-4 w-1/4 rounded bg-surface-subtle" />
            <div className="h-4 w-1/3 rounded bg-surface-subtle" />
          </div>
        ))}
      </div>
    </>
  );
}
