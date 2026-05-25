import { BotMessageSquare } from 'lucide-react';

const SUGGESTIONS = [
  'Tren kehadiran bulan ini?',
  'Jemaat paling aktif minggu ini?',
  'Perbandingan kehadiran bulan lalu?',
  'Ringkasan statistik ibadah?',
];

export default function EmptyState({ onSend }) {
  return (
    <div className="flex flex-col justify-center items-center gap-6 h-full text-center">
      <div>
        <div className="flex justify-center items-center bg-linear-to-br from-indigo-500 to-violet-600 shadow-indigo-200 shadow-lg mx-auto mb-3 rounded-2xl w-14 h-14">
          <BotMessageSquare size={24} className="text-white" />
        </div>
        <h2 className="font-bold text-slate-800 text-lg">Shalom! 👋</h2>
        <p className="mx-auto mt-1 max-w-xs text-slate-500 text-sm">
          Tanya saya soal kehadiran jemaat, tren ibadah, atau insight statistik gereja.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 max-w-md">
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            onClick={() => onSend(null, s)}
            className="bg-slate-50 hover:bg-indigo-50 px-3 py-1.5 border border-slate-200 hover:border-indigo-200 rounded-xl text-slate-600 hover:text-indigo-700 text-xs transition-all"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
