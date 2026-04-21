export default function SettingsPage() {
  return (
    <main className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Settings
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          Platform settings
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Reserved for future control-plane configuration such as payment-provider credentials, webhook settings, and operational preferences.
        </p>
      </section>
    </main>
  );
}
