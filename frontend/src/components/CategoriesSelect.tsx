import { useMemo } from 'react';

type CategoryType = 'operator' | 'problem' | 'cause';

type Category = { id: string; type: string; name: string };

export function CategoriesSelect({
  label,
  value,
  onChange,
  categories,
  type,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  categories: Category[];
  type: CategoryType;
  placeholder?: string;
  disabled?: boolean;
}) {
  const items = useMemo(() => {
    return categories.filter((c) => c.type === type);
  }, [categories, type]);

  return (
    <div>
      <label className="block text-xs text-slate-400">{label}</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none"
      >
        <option value="">{placeholder ?? 'Tutti'}</option>
        {items.map((it) => (
          <option key={it.id} value={it.id}>
            {it.name}
          </option>
        ))}
      </select>
    </div>
  );
}

