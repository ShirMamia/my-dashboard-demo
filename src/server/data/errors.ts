import type { PostgrestError } from "@supabase/supabase-js";

export type DataErrorCode =
  /** Unique violation, e.g. duplicate project/category name or a taken pick slot. */
  | "conflict"
  /** Check or foreign-key violation: the DB rejected the values or a cross-user reference. */
  | "invalid"
  | "not_found"
  | "unknown";

/** Failure from the data layer. `message` is technical; actions map codes to Hebrew copy. */
export class DataError extends Error {
  constructor(
    readonly code: DataErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DataError";
  }
}

const CODE_BY_SQLSTATE: Record<string, DataErrorCode> = {
  "23505": "conflict", // unique_violation
  "23503": "invalid", // foreign_key_violation
  "23514": "invalid", // check_violation
  "23502": "invalid", // not_null_violation
  "22P02": "invalid", // invalid_text_representation (e.g. malformed uuid)
  "22007": "invalid", // invalid_datetime_format
  "22008": "invalid", // datetime_field_overflow
  PGRST116: "not_found", // .single() matched no row (RLS hides other users' rows)
};

export function toDataError(error: PostgrestError): DataError {
  return new DataError(CODE_BY_SQLSTATE[error.code] ?? "unknown", error.message, error);
}

// Typed on the whole response: supabase-js responses are a success | failure union, and
// inferring T from `data: T | null` across that union collapses to never.
type Response = { data: unknown; error: PostgrestError | null };

/** Unwraps a Supabase result, throwing a DataError on failure. */
export function unwrap<R extends Response>(result: R): NonNullable<R["data"]> {
  if (result.error) throw toDataError(result.error);
  if (result.data === null || result.data === undefined) {
    throw new DataError("not_found", "No data returned");
  }
  return result.data;
}

/** Like unwrap(), for queries where no row is a valid answer (.maybeSingle()). */
export function unwrapMaybe<R extends Response>(result: R): NonNullable<R["data"]> | null {
  if (result.error) throw toDataError(result.error);
  return result.data ?? null;
}
