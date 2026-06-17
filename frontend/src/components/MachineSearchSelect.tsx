import { useEffect, useMemo, useRef, useState } from 'react';

export type MachineOption = { id: string; code: string; name: string; line?: string };

function formatMachine(m: MachineOption) {
  return `${m.code} - ${m.name}${m.line ? ` (${m.line})` : ''}`;
}

export function MachineSearchSelect({
  machines,
  value,
  onChange,
  disabled,
  className = '',
  placeholder = 'Cerca macchina per codice, nome o linea...',
}: {
  machines: MachineOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = machines.find((m) => m.id === value);

  useEffect(() => {
    if (selected) {
      setQuery(formatMachine(selected));
    } else if (!value) {
      setQuery('');
    }
  }, [selected, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return machines;
    if (selected && formatMachine(selected).toLowerCase() === q) return machines;
    return machines.filter(
      (m) =>
        m.code.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.line ?? '').toLowerCase().includes(q)
    );
  }, [machines, query, selected]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (selected) setQuery(formatMachine(selected));
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [selected]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value.trim()) onChange('');
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            if (selected) setQuery(formatMachine(selected));
          }
        }}
        className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none disabled:opacity-60"
      />
      {open && !disabled && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 shadow-xl">
          {filtered.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={`w-full px-4 py-2.5 text-left text-sm hover:bg-slate-800 ${
                  m.id === value ? 'bg-violet-500/10 text-violet-200' : 'text-slate-200'
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(m.id);
                  setQuery(formatMachine(m));
                  setOpen(false);
                }}
              >
                {formatMachine(m)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !disabled && query.trim() && filtered.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-400 shadow-xl">
          Nessuna macchina trovata.
        </div>
      )}
    </div>
  );
}
