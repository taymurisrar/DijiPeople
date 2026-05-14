import { MyPreferencesForm } from "./preferences-form";

export default function MyPreferencesPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Personal workspace
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">
            My Preferences
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Choose how dates, times, and regional display values appear for
            your account. Tenant and business rules remain controlled by
            administrators.
          </p>
        </section>

        <MyPreferencesForm />
      </div>
    </main>
  );
}
