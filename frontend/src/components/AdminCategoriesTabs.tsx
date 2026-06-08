import { useMemo, useState } from 'react';

type CategoryType = 'operator' | 'problem' | 'cause';

export function AdminCategoriesTabs({
  activeType,
  onChange,
}: {
  activeType: CategoryType;
  onChange: (t: CategoryType) => void;
}) {
  const tabs = useMemo(() => [
    { key: 'operator' as const, label: 'OPERATORI' },
    { key: 'problem' as const, label: 'PROBLEMI' },
    { key: 'cause' as const, label: 'CAUSE' },
  ], []);

  return (
    <div className="flex flex-wrap gap-3">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
            activeType === tab.key
              ? 'bg-sky-500 text-slate-950'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

