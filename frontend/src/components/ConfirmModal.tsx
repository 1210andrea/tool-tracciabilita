import { ReactNode } from 'react';

export function ConfirmModal({
  open,
  title,
  message,
  confirmText,
  cancelText,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmText: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`w-full max-w-md rounded-3xl border ${danger ? 'border-rose-500/40 bg-slate-950' : 'border-slate-700 bg-slate-900'} p-6 shadow-xl shadow-black/30`}>
        <div className="text-lg font-semibold text-slate-100">{title}</div>
        <div className="mt-2 text-sm text-slate-300">{message}</div>
        <div className="mt-6 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border border-slate-700 bg-slate-900/40 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800"
          >
            {cancelText ?? 'Annulla'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold text-slate-950 ${danger ? 'bg-rose-500 hover:bg-rose-400' : 'bg-sky-500 hover:bg-sky-400'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

