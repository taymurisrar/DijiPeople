export function StatusSelector({
  label = "Status",
  value,
  options,
  onChange,
}: {
  label?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-slate-700">
      {label}
      <select
        className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-1 text-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
