import { Suspense } from "react";
import { ActivateAccountForm } from "./activate-account-form";

export default function ActivateAccountPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-lg rounded-[32px] border border-border bg-surface p-8 shadow-xl">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted">
            Account Activation
          </p>
          <h1 className="text-3xl font-semibold text-foreground">
            Activate your DijiPeople access
          </h1>
          <p className="text-muted">
            Set your password to activate the account linked to your work email.
          </p>
        </div>

        <div className="mt-8">
          <Suspense fallback={<p className="text-sm text-muted">Loading activation flow...</p>}>
            <ActivateAccountForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
