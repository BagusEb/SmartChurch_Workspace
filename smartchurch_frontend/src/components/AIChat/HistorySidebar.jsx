import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { BotMessageSquare, Plus, Search, MessageSquare, Loader2, FileText, LogOut, X } from 'lucide-react';
import { getConversations } from '../../service/apiClient';

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

const ConversationItem = memo(
  function ConversationItem({ conv, isActive, onSelect }) {
    return (
      <button
        onClick={() => onSelect(conv)}
        className={`w-full text-left px-2.5 py-2.5 rounded-lg flex items-start gap-2.5 hover:bg-slate-50 transition-colors mb-0.5 ${
          isActive ? 'bg-indigo-50' : ''
        }`}
      >
        <MessageSquare size={13} className="mt-0.5 text-slate-400 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-slate-700 text-xs truncate">
            {conv.conversation_title || 'Percakapan'}
          </p>
          <p className="text-slate-400 text-[11px] mt-0.5">
            {formatTime(conv.last_activity_at || conv.created_at)}
          </p>
        </div>
      </button>
    );
  },
  (prev, next) =>
    (prev.conv.thread_id || prev.conv.langfuse_threadid) === (next.conv.thread_id || next.conv.langfuse_threadid) &&
    prev.isActive === next.isActive &&
    prev.conv.conversation_title === next.conv.conversation_title
);

export default function HistorySidebar({ activeThreadId, onSelectConversation, onNewChat, onClose, onReportClick, onLogout }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const onSelectRef = useRef(onSelectConversation);
  useEffect(() => { onSelectRef.current = onSelectConversation; }, [onSelectConversation]);
  const stableSelect = useCallback((conv) => onSelectRef.current(conv), []);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getConversations();
      setConversations(res.data?.results ?? res.data ?? []);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  useEffect(() => {
    if (!activeThreadId) return;
    const exists = conversations.some(
      c => (c.thread_id || c.langfuse_threadid) === activeThreadId
    );
    if (!exists) fetchConversations();
  }, [activeThreadId]);

  const filtered = conversations.filter(c =>
    (c.conversation_title || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">

      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex justify-center items-center bg-linear-to-br from-indigo-500 to-violet-600 rounded-xl w-8 h-8 shrink-0">
            <BotMessageSquare size={15} className="text-white" />
          </div>
          <span className="font-bold text-slate-800 text-sm">SmartChurch AI</span>
        </div>
        <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-slate-600 transition-colors p-0.5">
          <X size={18} />
        </button>
      </div>

      <div className="px-3 py-3 flex flex-col gap-2 shrink-0">
        <button
          onClick={onNewChat}
          className="flex items-center justify-center gap-2 w-full bg-linear-to-br from-indigo-500 to-violet-600 hover:opacity-90 px-3 py-2 rounded-xl font-semibold text-white text-sm transition-opacity"
        >
          <Plus size={14} />
          Chat Baru
        </button>
        <button
          onClick={onReportClick}
          className="flex items-center justify-center gap-2 w-full bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 px-3 py-2 rounded-xl font-semibold text-slate-600 hover:text-indigo-700 text-sm transition-all"
        >
          <FileText size={14} className="text-indigo-500 shrink-0" />
          Laporan Kehadiran
        </button>
      </div>

      <div className="px-3 pb-2 shrink-0">
        <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1.5 border border-slate-200 rounded-lg">
          <Search size={12} className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari percakapan..."
            className="flex-1 bg-transparent focus:outline-none text-slate-700 placeholder:text-slate-400 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={16} className="text-slate-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <MessageSquare size={20} className="text-slate-300" />
            <p className="text-slate-400 text-xs">Belum ada percakapan</p>
          </div>
        ) : (
          filtered.map(conv => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              isActive={(conv.thread_id || conv.langfuse_threadid) === activeThreadId}
              onSelect={stableSelect}
            />
          ))
        )}
      </div>

      <div className="border-t border-slate-100 px-3 py-3 shrink-0">
        <button
          onClick={onLogout}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-rose-50 text-slate-500 hover:text-rose-600 text-sm font-medium transition-colors w-full"
        >
          <LogOut size={15} className="shrink-0" />
          Logout
        </button>
      </div>

    </div>
  );
}
