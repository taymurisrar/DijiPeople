type ReportStatCardProps = {
  label: string;
  tone?: "default" | "accent";
  value: number | string;
};

export function ReportStatCard({
  label,
  tone = "default",
  value,
}: ReportStatCardProps) {
  return (
    <article
      className={`rounded-[24px] border p-5 shadow-sm ${
        tone === "accent"
          ? "border-accent/30 bg-[linear-gradient(135deg,rgba(240,249,255,0.96),rgba(224,242,254,0.9))]"
          : "border-border bg-white"
      }`}
    >
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-3 font-serif text-4xl text-foreground">{value}</p>
    </article>
  );
}
