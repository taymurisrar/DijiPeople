"use client";

export function LifecycleTabs<T extends string>({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: Array<{ key: T; label: string }>;
  activeTab: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={[
            "rounded-full px-4 py-2 text-sm font-medium transition",
            activeTab === tab.key
              ? "bg-slate-950 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900",
          ].join(" ")}
          onClick={() => onChange(tab.key)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
