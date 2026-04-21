export function SubStatusSelector({
  label = "Sub-status",
  value,
  options,
  onChange,
}: {
  label?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const uniqueOptions = options.filter(
    (option, index, array) =>
      array.findIndex(
        (item) => item.value === option.value && item.label === option.label,
      ) === index,
  );

  return (
    <label className="block text-xs font-medium text-slate-700">
      {label}
      <select
        className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-1 text-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {uniqueOptions.map((option, index) => (
          <option
            key={`${option.value}-${option.label}-${index}`}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}