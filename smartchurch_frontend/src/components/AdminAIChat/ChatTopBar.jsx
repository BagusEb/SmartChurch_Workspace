import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BotMessageSquare, RotateCcw, Loader2,
  ChevronDown, PanelRight, Clock,
  MessageSquare, Search,
} from 'lucide-react';
import { getConversations } from '../../service/apiClient';

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function ChatTopBar({ activeConvTitle, canvasOpen, activeThreadId, onSelectConversation, onNewChat, onToggleCanvas }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(false);
  const [convSearch, setConvSearch] = useState('');
  const historyRef = useRef(null);

  useEffect(() => {
    if (!historyOpen) return;
    const handler = (e) => {
      if (historyRef.current && !historyRef.current.contains(e.target)) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [historyOpen]);

  const fetchConversations = useCallback(async () => {
    setConvLoading(true);
    try {
      const res = await getConversations();
      setConversations(res.data?.results ?? res.data ?? []);
    } catch {
      setConversations([]);
    } finally {
      setConvLoading(false);
    }
  }, []);

  const handleToggleHistory = () => {
    if (!historyOpen) {
      fetchConversations();
      setConvSearch('');
    }
    setHistoryOpen(prev => !prev);
  };

  return (
    <div className="flex justify-between items-center px-6 py-3.5 border-slate-100 border-b shrink-0">
      <div className="flex items-center gap-2.5">
        <div className="flex justify-center items-center bg-linear-to-br from-indigo-500 to-violet-600 rounded-xl w-8 h-8 shrink-0">
          <BotMessageSquare size={16} className="text-white" />
        </div>
        <div>
          <p className="font-semibold text-slate-800 text-sm leading-tight">SmartChurch AI</p>
          {activeConvTitle ? (
            <p className="text-indigo-500 text-xs font-medium truncate max-w-56">{activeConvTitle}</p>
          ) : (
            <p className="text-slate-400 text-xs">Powered by LangChain</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative" ref={historyRef}>
          <button
            onClick={handleToggleHistory}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              historyOpen
                ? 'bg-indigo-50 text-indigo-700'
                : 'hover:bg-slate-100 text-slate-600 hover:text-slate-800'
            }`}
          >
            <Clock size={13} />
            Riwayat
            <ChevronDown size={12} className={`transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
          </button>

          {historyOpen && (
            <div className="top-full right-0 z-50 absolute bg-white shadow-lg mt-1.5 border border-slate-200 rounded-xl w-72 overflow-hidden">
              <div className="px-3 py-2.5 border-slate-100 border-b">
                <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1.5 border border-slate-200 rounded-lg">
                  <Search size={12} className="text-slate-400 shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    value={convSearch}
                    onChange={e => setConvSearch(e.target.value)}
                    placeholder="Cari percakapan..."
                    className="flex-1 bg-transparent focus:outline-none text-slate-700 placeholder:text-slate-400 text-xs"
                  />
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto">
                {convLoading ? (
                  <div className="flex justify-center items-center py-6">
                    <Loader2 size={16} className="text-slate-400 animate-spin" />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="flex flex-col items-center gap-1.5 px-4 py-6 text-center">
                    <MessageSquare size={18} className="text-slate-300" />
                    <p className="text-slate-400 text-xs">Belum ada riwayat percakapan.</p>
                  </div>
                ) : (
                  conversations
                    .filter(conv =>
                      (conv.conversation_title || '').toLowerCase().includes(convSearch.toLowerCase())
                    )
                    .map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => { onSelectConversation(conv); setHistoryOpen(false); }}
                        className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-slate-50 transition-colors ${
                          (conv.thread_id || conv.langfuse_threadid) === activeThreadId ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <MessageSquare size={13} className="mt-0.5 text-slate-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-700 text-xs truncate">
                            {conv.conversation_title || 'Percakapan'}
                          </p>
                          <p className="text-slate-400 text-xs truncate">
                            {formatTime(conv.last_activity_at || conv.created_at)}
                          </p>
                        </div>
                      </button>
                    ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onToggleCanvas}
          title="Toggle canvas"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            canvasOpen
              ? 'bg-indigo-50 text-indigo-700'
              : 'hover:bg-slate-100 text-slate-600 hover:text-slate-800'
          }`}
        >
          <PanelRight size={13} />
          Canvas
        </button>

        <button
          onClick={onNewChat}
          title="Mulai ulang percakapan"
          className="flex items-center gap-1.5 hover:bg-slate-100 px-3 py-1.5 rounded-lg font-medium text-slate-500 hover:text-slate-700 text-xs transition-all"
        >
          <RotateCcw size={13} />
          Mulai Ulang
        </button>
      </div>
    </div>
  );
}
