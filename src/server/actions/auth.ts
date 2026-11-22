"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { LOGIN_PATH, safeNextPath } from "@/lib/auth-routes";
import { createClient } from "@/lib/supabase/server";

export interface SignInState {
  /** Form-level error (an error summary). */
  error?: string;
  fieldErrors?: { email?: string; password?: string };
  /** Echoed back so the field keeps its value after a failed attempt. */
  email?: string;
}

const signInSchema = z.object({
  email: z.email({ error: "יש להזין כתובת אימייל תקינה." }),
  password: z.string().min(1, { error: "יש להזין סיסמה." }),
});

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = signInSchema.safeParse({ email, password: formData.get("password") ?? "" });
  if (!parsed.success) {
    const fields = z.flattenError(parsed.error).fieldErrors;
    return {
      email,
      error: "לא ניתן להתחבר. יש לתקן את השדות המסומנים.",
      fieldErrors: { email: fields.email?.[0], password: fields.password?.[0] },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Same message for unknown email and wrong password.
    if (error.code === "invalid_credentials") return { email, error: "האימייל או הסיסמה שגויים." };
    return { email, error: "לא ניתן להתחבר כרגע. יש לנסות שוב בעוד רגע." };
  }

  redirect(safeNextPath(formData.get("next")?.toString()));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  // This device only; other signed-in devices keep their sessions.
  await supabase.auth.signOut({ scope: "local" });
  redirect(LOGIN_PATH);
}
