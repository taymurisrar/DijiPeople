"use client";

export function SortControl({
  value,
  direction,
  options,
  onChange,
}: {
  value: string;
  direction: string;
  options: Array<{ value: string; label: string }>;
  onChange: (next: { value: string; direction: string }) => void;
}) {
  return (
    <div className="flex gap-2">
      <select
        className="flex-1 rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        onChange={(event) => onChange({ value: event.target.value, direction })}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        className="w-28 rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        onChange={(event) => onChange({ value, direction: event.target.value })}
        value={direction}
      >
        <option value="desc">Desc</option>
        <option value="asc">Asc</option>
      </select>
    </div>
  );
}
