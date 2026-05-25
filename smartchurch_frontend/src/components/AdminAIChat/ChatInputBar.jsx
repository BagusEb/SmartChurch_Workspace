import { Send, Loader2 } from 'lucide-react';

export default function ChatInputBar({ input, setInput, isStreaming, inputRef, onSend }) {
  return (
    <div className="bg-white px-6 py-4 border-slate-100 border-t shrink-0">
      <form
        onSubmit={onSend}
        className="flex items-center gap-2 bg-slate-50 mx-auto px-4 py-2 border border-slate-200 focus-within:border-indigo-300 rounded-xl focus-within:ring-2 focus-within:ring-indigo-100 max-w-2xl transition-all"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Tanya soal data kehadiran..."
          className="flex-1 bg-transparent py-1 focus:outline-none text-slate-700 placeholder:text-slate-400 text-sm"
        />
        <button
          type="submit"
          disabled={!input.trim() || isStreaming}
          className="flex justify-center items-center bg-linear-to-br from-indigo-500 to-violet-600 disabled:opacity-40 rounded-lg w-8 h-8 transition-all shrink-0"
          aria-label="Kirim pesan"
        >
          {isStreaming
            ? <Loader2 size={14} className="text-white animate-spin" />
            : <Send size={14} className="ml-0.5 text-white" />
          }
        </button>
      </form>
      <p className="mt-2 text-slate-400 text-xs text-center">
        SmartChurch AI dapat membuat kesalahan. Selalu verifikasi data penting.
      </p>
    </div>
  );
}
