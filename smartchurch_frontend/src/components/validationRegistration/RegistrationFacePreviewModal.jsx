//smartchurch_frontend\src\components\validationRegistration\RegistrationFacePreviewModal.jsx

import { X } from "lucide-react";

export default function RegistrationFacePreviewModal({
  image,
  title,
  subtitle,
  onClose,
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute -left-1 -top-12 inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-extrabold text-slate-700 shadow-lg transition-all hover:bg-slate-100"
        >
          <X size={17} />
          Close
        </button>

        <button
          type="button"
          onClick={onClose}
          className="block w-full overflow-hidden rounded-3xl border border-white/20 bg-white p-3 shadow-2xl"
          title="Klik gambar untuk menutup"
        >
          <div className="flex max-h-[76vh] items-center justify-center rounded-2xl bg-slate-100">
            <img
              src={image}
              alt={title || "Registration face preview"}
              className="max-h-[72vh] w-full object-contain"
            />
          </div>

          {(title || subtitle) && (
            <div className="px-2 pb-1 pt-3 text-left">
              {title && (
                <p className="text-sm font-extrabold text-slate-800">
                  {title}
                </p>
              )}
              {subtitle && (
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {subtitle}
                </p>
              )}
            </div>
          )}
        </button>
      </div>
    </div>
  );
}