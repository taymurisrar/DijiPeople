import { Suspense } from "react";
import Image from "next/image";
import { BarChart3, Building2, ShieldCheck } from "lucide-react";
import { AdminLoginForm } from "./login-form";

export default async function AdminLoginPage() {
  return (
    <main className="flex h-dvh overflow-hidden bg-[#eef7f5] p-3 sm:p-5">
      <div className="mx-auto grid h-full max-h-[860px] w-full max-w-7xl overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_30px_90px_rgba(15,56,48,0.12)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-[#073c34] p-8 text-white lg:flex lg:flex-col lg:justify-between xl:p-10">
          <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-emerald-300/15 blur-3xl" />
          <div className="absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-teal-200/10 blur-3xl" />
          <div className="relative">
            <Image
              src="/logo-primary-horizontal.svg"
              alt="DijiPeople"
              width={370}
              height={100}
              priority
              className="h-10 w-auto brightness-0 invert"
            />
            <p className="mt-7 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
              Platform operations
            </p>
            <h1 className="mt-3 max-w-xl text-4xl font-semibold leading-tight xl:text-[2.65rem]">
              One secure control hub for the entire DijiPeople platform.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-emerald-50/75 xl:text-base xl:leading-7">
              Manage customers, onboarding, agreements, billing, partners, and
              tenant operations from a single governed workspace.
            </p>
          </div>
          <div className="relative grid gap-3 sm:grid-cols-3">
            {[
              [ShieldCheck, "Protected", "Role-based platform access"],
              [Building2, "Connected", "Customer-to-tenant lifecycle"],
              [BarChart3, "Observable", "Operational activity and audit"],
            ].map(([Icon, title, copy]) => {
              const FeatureIcon = Icon as typeof ShieldCheck;
              return (
                <div key={String(title)} className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
                  <FeatureIcon className="h-5 w-5 text-emerald-300" />
                  <p className="mt-2 text-sm font-semibold">{String(title)}</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-50/60">{String(copy)}</p>
                </div>
              );
            })}
          </div>
        </section>
        <section className="flex min-h-0 items-center justify-center overflow-hidden p-5 sm:p-8 lg:p-10">
          <div className="w-full max-w-md">
            <div className="mb-6 space-y-3">
              <Image
                src="/logo-primary-horizontal.svg"
                alt="DijiPeople"
                width={370}
                height={100}
                priority
                className="h-10 w-auto lg:hidden"
              />
              <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-800">
                Platform Admin
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                Welcome back
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                Sign in with your authorized platform administrator account.
              </p>
            </div>
            <Suspense fallback={null}>
              <AdminLoginForm />
            </Suspense>
            <p className="mt-5 text-center text-xs leading-5 text-slate-400">
              Access is monitored and recorded for platform security.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
