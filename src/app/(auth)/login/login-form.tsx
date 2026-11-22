"use client";

import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, type SignInState } from "@/server/actions/auth";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  const summaryRef = useRef<HTMLDivElement>(null);
  const [passwordShown, setPasswordShown] = useState(false);

  // Move focus to the error summary so screen-reader users hear it (MASTER.md §7).
  useEffect(() => {
    if (state.error) summaryRef.current?.focus();
  }, [state]);

  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger bg-danger-tint p-3 text-sm text-danger"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">אימייל</Label>
        <Input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="username"
          required
          defaultValue={state.email}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "email-error" : undefined}
        />
        {emailError ? (
          <p id="email-error" className="text-sm text-danger">
            {emailError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">סיסמה</Label>
        <div className="relative">
          {/* The field is LTR, so its inline-start padding is on the left: under the toggle, which
              sits at the wrapper's inline-end (left in RTL). */}
          <Input
            id="password"
            name="password"
            type={passwordShown ? "text" : "password"}
            dir="ltr"
            autoComplete="current-password"
            required
            className="ps-11"
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? "password-error" : undefined}
          />
          <button
            type="button"
            aria-label="הצגת הסיסמה"
            aria-pressed={passwordShown}
            aria-controls="password"
            onClick={() => setPasswordShown((shown) => !shown)}
            className="absolute inset-y-0 end-0 my-auto inline-flex size-10 items-center justify-center rounded-md text-text-secondary hover:text-text-primary"
          >
            {passwordShown ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
          </button>
        </div>
        {passwordError ? (
          <p id="password-error" className="text-sm text-danger">
            {passwordError}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" disabled={pending} aria-busy={pending || undefined}>
        {pending ? "מתחבר…" : "כניסה"}
      </Button>
    </form>
  );
}
