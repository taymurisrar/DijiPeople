type SettingsFormCardProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

export function SettingsFormCard({
  title,
  description,
  children,
}: SettingsFormCardProps) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="border-b border-slate-100 pb-5">
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>

        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {description}
          </p>
        ) : null}
      </div>

      <div className="mt-6">{children}</div>
    </section>
  );
}