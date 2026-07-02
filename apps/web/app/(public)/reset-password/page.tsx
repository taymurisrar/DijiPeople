import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <section className="w-full max-w-md rounded-[28px] border border-border bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Account security
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">
          Reset password
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Choose a new password for your DijiPeople account.
        </p>
        <div className="mt-6">
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
