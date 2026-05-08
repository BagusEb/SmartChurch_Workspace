import { useEffect, useRef, useState } from 'react';
import { BotMessageSquare, Send, User, Sparkles, RotateCcw, LogOut, Loader2, Database, BarChart2, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BubbleMessage from '../components/BubbleMessage';
import MarkdownRenderer from '../components/MarkdownRenderer';
import useChat from '../hooks/useChat';

const THREAD_ID_STORAGE_KEY = 'smartchurch_ai_thread_id';

const TOOL_META = {
  query_postgres: { label: 'Querying database', icon: Database },
  generate_seaborn_plot: { label: 'Generating chart', icon: BarChart2 },
};

const SUGGESTIONS = [
  'Tren kehadiran bulan ini?',
  'Jemaat paling aktif minggu ini?',
  'Perbandingan kehadiran bulan lalu?',
  'Ringkasan statistik ibadah?',
];

// ── Tool call pill component ─────────────────────────────────
// ── Tool call pill component ─────────────────────────────────
function ToolCallPill({ toolName }) {
  const meta = TOOL_META[toolName] || { label: toolName, icon: Loader2 };
  const Icon = meta.icon;
  return (
    <div className="inline-flex items-center gap-1.5 bg-indigo-50 px-2.5 py-1 border border-indigo-200 rounded-full font-medium text-indigo-700 text-xs">
      <Icon size={11} />
      {meta.label}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────
export default function AIChat() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null); 
  const { messages, addMessage, resetChat, isStreaming } = useChat(
    typeof window !== 'undefined' ? sessionStorage.getItem('smartchurch_ai_thread_id') : null,
  );

  // Auto-scroll
  useEffect(() => {
    console.log({messages});
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e, overrideText) => {
    e?.preventDefault();
    const userMessage = (overrideText ?? input).trim();
    if (!userMessage) return;

    setInput('');
    await addMessage(userMessage);
  };

  const handleRestart = () => {
    setInput('');
    resetChat();
    inputRef.current?.focus();
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    sessionStorage.removeItem(THREAD_ID_STORAGE_KEY);
    navigate('/login');
    window.location.reload();
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col bg-slate-50 w-full h-screen overflow-hidden">

      {/* ── Header ── */}
      <header className="flex justify-between items-center bg-linear-to-r from-indigo-600 to-violet-600 shadow-lg px-4 sm:px-8 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex justify-center items-center bg-white/20 rounded-2xl w-10 h-10 shrink-0">
            <BotMessageSquare size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white text-base sm:text-lg leading-tight">SmartChurch AI</h1>
            <p className="flex items-center gap-1 mt-0.5 text-indigo-200 text-xs">
              <Sparkles size={10} />
              Powered by Langchain
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRestart}
            title="Mulai ulang percakapan"
            aria-label="Mulai ulang percakapan"
            className="flex items-center gap-2 hover:bg-white/15 px-3 py-2 rounded-xl text-white/70 hover:text-white text-sm transition-all"
          >
            <RotateCcw size={15} />
            <span className="hidden sm:inline">Mulai Ulang</span>
          </button>
          <button
            onClick={handleLogout}
            title="Logout"
            aria-label="Logout"
            className="flex items-center gap-2 hover:bg-white/15 px-3 py-2 rounded-xl text-white/70 hover:text-white text-sm transition-all"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* ── Message Area ── */}
      <div className="flex flex-col flex-1 overflow-y-auto">

        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col flex-1 justify-center items-center gap-8 px-4 py-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="flex justify-center items-center bg-linear-to-br from-indigo-500 to-violet-600 shadow-indigo-200 shadow-lg rounded-3xl w-16 h-16">
                <BotMessageSquare size={30} className="text-white" />
              </div>
              <div>
                <h2 className="font-bold text-slate-800 text-xl sm:text-2xl">Shalom! 👋</h2>
                <p className="mt-1 max-w-sm text-slate-500 text-sm sm:text-base">
                  Tanya saya soal kehadiran jemaat, tren ibadah, atau insight statistik gereja.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => handleSend(null, s)}
                  className="bg-white hover:bg-indigo-50 px-4 py-2 border border-slate-200 hover:border-indigo-200 rounded-xl text-slate-600 hover:text-indigo-700 text-sm transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {!isEmpty && (
          <div className="flex flex-col gap-4 mx-auto px-4 sm:px-6 py-6 w-full max-w-3xl">

            {/* Welcome bubble */}
            <BubbleMessage
              avatar={<BotMessageSquare size={13} />}
              content={
                <MarkdownRenderer>
                  Shalom! Saya AI Assistant SmartChurch. Ada insight kehadiran atau tren jemaat yang ingin Anda ketahui hari ini?
                </MarkdownRenderer>
              }
              alignment="left"
              avatarClass="bg-linear-to-br from-indigo-500 to-violet-600 text-white"
              bubbleClass="bg-white border border-slate-100 text-slate-700 shadow-sm rounded-tl-sm"
            />

            {...messages.reduce((acc, msg, i) => {
              console.log({acc})
              if (!msg.data) return acc;
              const msgData = msg.data;
              const type = msg.type;
              const msgContent = msgData?.content;
              const toolCalls = msgData?.tool_calls ?? [];

              const classes = new Map([
                ["human", {
                  avatar: <User size={13} />,
                  avatarClass: 'bg-indigo-100 text-indigo-600',
                  bubbleClass: 'bg-linear-to-br from-indigo-500 to-violet-600 text-white rounded-tr-sm',
                  alignment: 'right'
                }],
                ["ai", {
                  avatar: <BotMessageSquare size={13} />,
                  avatarClass: 'bg-linear-to-br from-indigo-500 to-violet-600 text-white',
                  bubbleClass: 'bg-white border border-slate-100 text-slate-700 shadow-sm rounded-tl-sm',
                  alignment: 'left'
                }]
              ]);

              if (!classes.has(type)) return acc;
              const styling = classes.get(type);
              for (const tc of toolCalls){
                acc.toolNames.add(tc.name);
              }
              const lastMessage = i == messages.length -1;
              if (lastMessage && msgContent=== ""){
                acc.components.push(
                  <div key={i} className="flex flex-col gap-2">
                  {/* ✅ Pills sit inside the message group, above the bubble */}
                  {acc.toolNames.size > 0 && (
                    <div className="flex flex-wrap gap-2 pl-8">
                      {Array.from(acc.toolNames).map((tc, j) => {
                        if (!Object.keys(TOOL_META).includes(tc)) return;
                        return <ToolCallPill key={`${tc}-${j}`} toolName={tc} />
                      })}
                    </div>
                  )}
                </div>
                )
              }
              if(!msgContent) return acc
              acc.components.push(
                // ✅ Key moved to the wrapping fragment/div
                <div key={i} className="flex flex-col gap-2">
                  {/* ✅ Pills sit inside the message group, above the bubble */}
                  {acc.toolNames.size > 0 && (
                    <div className="flex flex-wrap gap-2 pl-8">
                      {Array.from(acc.toolNames).map((tc, j) => {
                        if (!Object.keys(TOOL_META).includes(tc)) return;
                        return <ToolCallPill key={`${tc}-${j}`} toolName={tc} />
                      })}
                    </div>
                  )}
                  {msgContent && (
                    <BubbleMessage
                      avatar={styling.avatar}
                      content={<MarkdownRenderer>{msgContent}</MarkdownRenderer>}
                      alignment={styling.alignment}
                      avatarClass={styling.avatarClass}
                      bubbleClass={styling.bubbleClass}
                    />
                  )}
                </div>
              );
              acc.toolNames.clear();
              return acc;
            }, {components:[], toolNames:new Set()}).components}
            
            {isStreaming && (
              <BubbleMessage
                avatar={<BotMessageSquare size={13} />}
                content={
                  <div className="flex items-center gap-1.5 py-0.5">
                    <span className="bg-slate-400 rounded-full w-2 h-2 animate-bounce [animation-delay:0ms]" />
                    <span className="bg-slate-400 rounded-full w-2 h-2 animate-bounce [animation-delay:150ms]" />
                    <span className="bg-slate-400 rounded-full w-2 h-2 animate-bounce [animation-delay:300ms]" />
                  </div>
                }
                alignment="left"
                avatarClass="bg-linear-to-br from-indigo-500 to-violet-600 text-white"
                bubbleClass="bg-white border border-slate-100 text-slate-700 shadow-sm rounded-tl-sm"
              />
            )}
            

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Input Bar ── */}
      <div className="bg-white shadow-[0_-1px_12px_rgba(0,0,0,0.06)] px-4 sm:px-6 py-4 border-slate-100 border-t shrink-0">
        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 bg-slate-50 mx-auto px-4 py-2 border border-slate-200 focus-within:border-indigo-300 rounded-2xl focus-within:ring-2 focus-within:ring-indigo-100 max-w-3xl transition-all"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Tanya soal data kehadiran..."
            className="flex-1 bg-transparent py-1.5 focus:outline-none text-slate-700 placeholder:text-slate-400 text-sm sm:text-base"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="flex justify-center items-center bg-linear-to-br from-indigo-500 to-violet-600 disabled:opacity-40 rounded-xl w-9 h-9 transition-all shrink-0"
            aria-label="Kirim pesan"
          >
            {isStreaming
              ? <Loader2 size={15} className="text-white animate-spin" />
              : <Send size={15} className="ml-0.5 text-white" />
            }
          </button>
        </form>
        <p className="mt-2 text-slate-400 text-xs text-center">
          SmartChurch AI dapat membuat kesalahan. Selalu verifikasi data penting.
        </p>
      </div>
    </div>
  );
}