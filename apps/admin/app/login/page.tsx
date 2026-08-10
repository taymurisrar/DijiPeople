import { Suspense } from "react";
import Image from "next/image";
import { AdminLoginForm } from "./login-form";

export default async function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 space-y-2">
          <Image
            src="/logo-primary-horizontal.svg"
            alt="DijiPeople"
            width={370}
            height={100}
            priority
            className="h-9 w-auto"
          />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Platform Admin
          </p>
          <h1 className="text-2xl font-semibold text-slate-950">Sign in</h1>
          <p className="text-sm text-slate-600">
            Sign in to access tenant and platform administration.
          </p>
        </div>

        <Suspense fallback={null}>
          <AdminLoginForm />
        </Suspense>
      </div>
    </main>
  );
}
