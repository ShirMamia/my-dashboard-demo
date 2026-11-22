"use client";

import { ConfirmDeleteButton } from "@/components/layout/confirm-delete-button";
import { deleteTemplateAction } from "@/server/actions/templates";

/** Delete with confirmation (MASTER_SPEC §14). Tasks created from the template stay as they are. */
export function DeleteTemplateButton({
  templateId,
  name,
  focusAfterId,
}: {
  templateId: string;
  name: string;
  /** Receives focus once the row (and its trigger) is gone. */
  focusAfterId: string;
}) {
  return (
    <ConfirmDeleteButton
      srContext={`של התבנית ${name}`}
      title="למחוק את התבנית?"
      description={
        <>
          התבנית <bdi className="font-semibold">{name}</bdi> תימחק לצמיתות. משימות שכבר נוצרו ממנה לא ישתנו.
        </>
      }
      confirmLabel="מחיקת התבנית"
      successMessage={
        <>
          התבנית <bdi className="font-semibold">{name}</bdi> נמחקה.
        </>
      }
      onConfirm={() => deleteTemplateAction(templateId)}
      focusAfterId={focusAfterId}
    />
  );
}
