import Image from "next/image";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef7f5] p-4">
      <section className="w-full max-w-md rounded-[2rem] border border-white bg-white p-7 shadow-[0_24px_70px_rgba(15,56,48,0.12)] sm:p-9">
        <Image src="/logo-primary-horizontal.svg" alt="DijiPeople" width={370} height={100} priority className="h-10 w-auto" />
        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">Platform Admin</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Reset access</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Enter your platform administrator email. We will send a one-time link that expires in one hour.
        </p>
        <div className="mt-7"><ForgotPasswordForm /></div>
      </section>
    </main>
  );
}
