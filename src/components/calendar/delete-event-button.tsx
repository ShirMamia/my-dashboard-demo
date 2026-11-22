"use client";

import { ConfirmDeleteButton } from "@/components/layout/confirm-delete-button";
import { deleteEventAction } from "@/server/actions/events";

/** Delete with confirmation (MASTER_SPEC §14). Only the event goes; nothing else in the Calendar changes. */
export function DeleteEventButton({
  eventId,
  title,
  yearly,
  focusAfterId,
}: {
  eventId: string;
  title: string;
  yearly: boolean;
  /** Receives focus once the event (and this trigger) is gone. */
  focusAfterId: string;
}) {
  return (
    <ConfirmDeleteButton
      size="sm"
      srContext={`של האירוע ${title}`}
      title="למחוק את האירוע?"
      description={
        <>
          האירוע <bdi className="font-semibold">{title}</bdi> יימחק לצמיתות{yearly ? " מכל השנים" : ""}. משימות ופריטים אחרים לא ישתנו.
        </>
      }
      confirmLabel="מחיקת האירוע"
      successMessage={
        <>
          האירוע <bdi className="font-semibold">{title}</bdi> נמחק.
        </>
      }
      onConfirm={() => deleteEventAction(eventId)}
      focusAfterId={focusAfterId}
    />
  );
}
