import { formatFeatureName } from "@/lib/formatters";

type FeatureChipProps = {
  value: string;
};

export function FeatureChip({ value }: FeatureChipProps) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
      {formatFeatureName(value)}
    </span>
  );
}
