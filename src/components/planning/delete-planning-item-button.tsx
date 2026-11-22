"use client";

import { ConfirmDeleteButton } from "@/components/layout/confirm-delete-button";
import { deletePlanningItemAction } from "@/server/actions/planning";

/** Delete with confirmation (MASTER_SPEC §14). Its preparation task stays: it's an independent task (§11). */
export function DeletePlanningItemButton({
  itemId,
  title,
  hasPreparationTask,
  focusAfterId,
}: {
  itemId: string;
  title: string;
  hasPreparationTask: boolean;
  focusAfterId: string;
}) {
  return (
    <ConfirmDeleteButton
      srContext={`של פריט התכנון ${title}`}
      title="למחוק את פריט התכנון?"
      description={
        <>
          פריט התכנון <bdi className="font-semibold">{title}</bdi> יימחק לצמיתות.
          {hasPreparationTask ? " משימת ההכנה שלו לא תימחק ולא תשתנה." : ""}
        </>
      }
      confirmLabel="מחיקת פריט התכנון"
      successMessage={
        <>
          פריט התכנון <bdi className="font-semibold">{title}</bdi> נמחק.
        </>
      }
      onConfirm={() => deletePlanningItemAction(itemId)}
      focusAfterId={focusAfterId}
    />
  );
}
