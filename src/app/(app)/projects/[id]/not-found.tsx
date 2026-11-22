import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export default function ProjectNotFound() {
  return (
    <>
      <PageHeader title="הפרויקט לא נמצא" />
      <EmptyState
        icon={SearchX}
        title="הפרויקט לא קיים."
        description="ייתכן שנמחק, או שהקישור שגוי."
        action={
          <Button asChild variant="outline">
            <Link href="/projects">לכל הפרויקטים</Link>
          </Button>
        }
      />
    </>
  );
}
