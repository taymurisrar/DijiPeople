"use client";

export function SearchBar({
  defaultValue,
  placeholder,
  onCommit,
}: {
  defaultValue?: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  return (
    <input
      className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
      defaultValue={defaultValue}
      onBlur={(event) => onCommit(event.target.value)}
      placeholder={placeholder ?? "Search records"}
    />
  );
}
