import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export default function TaskNotFound() {
  return (
    <>
      <PageHeader title="המשימה לא נמצאה" />
      <EmptyState
        icon={SearchX}
        title="המשימה לא קיימת."
        description="ייתכן שנמחקה, או שהקישור שגוי."
        action={
          <Button asChild variant="outline">
            <Link href="/tasks">חזרה למשימות</Link>
          </Button>
        }
      />
    </>
  );
}
