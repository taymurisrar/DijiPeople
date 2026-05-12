"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="grid min-h-screen place-items-center bg-slate-100 p-6 text-slate-950">
          <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Unexpected error</p>
            <h1 className="mt-2 text-2xl font-semibold">The admin app could not load this view.</h1>
            <p className="mt-2 text-sm text-slate-600">Try again. If it keeps happening, share this reference with support.</p>
            {error.digest ? <p className="mt-3 break-all font-mono text-xs text-slate-500">{error.digest}</p> : null}
            <button className="mt-5 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white" onClick={reset} type="button">
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
