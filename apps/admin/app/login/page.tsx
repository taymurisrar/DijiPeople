import { Suspense } from "react";
import Image from "next/image";
import { BarChart3, Building2, ShieldCheck } from "lucide-react";
import { AdminLoginForm } from "./login-form";

export default async function AdminLoginPage() {
  return (
    <main className="min-h-screen bg-[#eef7f5] p-3 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-7xl overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_30px_90px_rgba(15,56,48,0.12)] sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden overflow-hidden bg-[#073c34] p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-300/15 blur-3xl" />
          <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-teal-200/10 blur-3xl" />
          <div className="relative">
            <Image
              src="/logo-primary-horizontal.svg"
              alt="DijiPeople"
              width={370}
              height={100}
              priority
              className="h-11 w-auto brightness-0 invert"
            />
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
              Platform operations
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight">
              One secure control hub for the entire DijiPeople platform.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-emerald-50/75">
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
                <div key={String(title)} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <FeatureIcon className="h-5 w-5 text-emerald-300" />
                  <p className="mt-3 text-sm font-semibold">{String(title)}</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-50/60">{String(copy)}</p>
                </div>
              );
            })}
          </div>
        </section>
        <section className="flex items-center justify-center p-6 sm:p-10 lg:p-14">
          <div className="w-full max-w-md">
            <div className="mb-9 space-y-3">
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
            <p className="mt-8 text-center text-xs leading-5 text-slate-400">
              Access is monitored and recorded for platform security.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
