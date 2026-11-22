import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LOGIN_PATH } from "@/lib/auth-routes";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export interface AuthContext {
  db: ServerClient;
  userId: string;
}

/**
 * Verified user for server reads and actions. getClaims() validates the JWT signature,
 * so an unverified cookie session is never trusted (ARCHITECTURE §2).
 */
export async function getAuth(): Promise<AuthContext | null> {
  // Always per request: auth is never prerendered (supabase-js also reads the clock).
  await connection();
  const db = await createClient();
  const { data, error } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;
  return { db, userId };
}

/** Like getAuth(), but redirects to the login page when there's no verified user. */
export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect(LOGIN_PATH);
  return auth;
}
