//smartchurch_frontend\src\components\validationRegistration\RegistrationModalShell.jsx

import { X } from "lucide-react";

export default function RegistrationModalShell({
  title,
  subtitle,
  icon,
  children,
  onClose,
  maxWidth = "max-w-3xl",
}) {
  return (
    <div className="gv-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div
        className={`gv-modal flex max-h-[92vh] w-full ${maxWidth} flex-col overflow-hidden rounded-3xl bg-white shadow-2xl`}
      >
        <div
          className="flex items-center justify-between gap-4 px-5 py-4 text-white"
          style={{
            background: "linear-gradient(135deg,#f59e0b,#d97706)",
          }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              {icon}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-extrabold">{title}</h3>
              <p className="mt-0.5 truncate text-xs text-amber-100">
                {subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/70 transition-all hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="gv-scroll overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function RegistrationModalFooter({
  cancelText,
  confirmText,
  confirmIcon,
  onCancel,
  onConfirm,
  danger = false,
  disabled = false,
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
      <button
        type="button"
        disabled={disabled}
        onClick={onCancel}
        className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
          disabled
            ? "cursor-not-allowed text-slate-300"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        {cancelText}
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={onConfirm}
        className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold text-white shadow-md transition-all ${
          disabled
            ? "cursor-not-allowed bg-slate-400"
            : danger
            ? "bg-rose-600 hover:bg-rose-700"
            : "bg-amber-600 hover:bg-amber-700"
        }`}
      >
        {confirmIcon}
        {confirmText}
      </button>
    </div>
  );
}