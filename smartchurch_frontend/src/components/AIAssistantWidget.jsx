// ============================================================
//  AIAssistantWidget.jsx
//  Floating AI chat widget — opens/closes a conversation panel
//  where church leaders can ask attendance-related questions.
//  All logic is preserved; visual layer is refined (not overdone).
// ============================================================

// ── React hook
import { useState, useEffect, useRef } from 'react';
import useChat from '../hooks/useChat';

// ── Icons
import { BotMessageSquare, X, Send, User, Sparkles, RotateCcw, Maximize2, Loader2, Database, BarChart2 } from 'lucide-react';
import BubbleMessage from './BubbleMessage';
import MarkdownRenderer from './MarkdownRenderer';

const THREAD_ID_STORAGE_KEY = 'smartchurch_ai_thread_id';

const TOOL_META = {
  query_postgres: { label: 'Querying database', icon: Database },
  generate_seaborn_plot: { label: 'Generating chart', icon: BarChart2 },
};

function ToolCallPill({ toolName }) {
  const meta = TOOL_META[toolName] || { label: toolName, icon: Loader2 };
  const Icon = meta.icon;
  return (
    <div className="inline-flex items-center gap-1.5 bg-indigo-50 px-2 py-0.5 border border-indigo-200 rounded-full font-medium text-indigo-700 text-[11px]">
      <Icon size={10} />
      {meta.label}
    </div>
  );
}

const defaultAccent = {
  gradient: 'from-indigo-500 to-violet-600',
  mutedText: 'text-indigo-200',
  focusBorder: 'focus-within:border-indigo-300',
  focusRing: 'focus-within:ring-2 focus-within:ring-indigo-100',
  glow: 'before:bg-indigo-500/20',
  userBubble: 'bg-indigo-100 text-indigo-600',
};

export default function AIAssistantWidget({ accent = defaultAccent }) {

  // ── Controls whether the chat window is open
  const [isOpen, setIsOpen] = useState(false);

  // ── Current value of the text input
  const [input, setInput] = useState('');

  const { messages, addMessage, resetChat, isStreaming } = useChat(
    typeof window !== 'undefined' ? sessionStorage.getItem(THREAD_ID_STORAGE_KEY) : null,
  );

  // ── Ref to scroll to the latest message automatically
  const bottomRef = useRef(null);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleRestart = () => {
    setInput('');
    resetChat();
  };
  
  // Handles sending a user message
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput('');

    await addMessage(userMessage);
  };

  // ============================================================
  //  RENDER
  // ============================================================
  return (
    <>
      <div className="right-6 bottom-6 z-50 fixed flex flex-col items-end font-sans">

        {/* ============================================================
             CHAT WINDOW — rendered when isOpen is true
        ============================================================ */}
        {isOpen && (
          <div className="flex flex-col bg-white shadow-2xl border border-slate-200 rounded-2xl w-90 h-130 overflow-hidden transition-all duration-200">

            {/* ── Header ── */}
            <div className={`flex justify-between items-center bg-linear-to-br ${accent.gradient} px-4 py-3.5 shrink-0`}>
              <div className="flex items-center gap-3">
                {/* Bot avatar */}
                <div className="flex justify-center items-center bg-white/20 rounded-xl w-9 h-9 shrink-0">
                  <BotMessageSquare size={18} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm leading-tight">SmartChurch AI</p>
                  <p className={`flex items-center gap-1 mt-0.5 ${accent.mutedText} text-xs`}>
                    <Sparkles size={9} />
                    Powered by Langchain
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleRestart}
                  title="Mulai ulang percakapan"
                  aria-label="Mulai ulang percakapan"
                  className="hover:bg-white/10 p-1.5 rounded-xl text-white/60 hover:text-white transition-all"
                >
                  <RotateCcw size={15} />
                </button>

                {/* Close button */}
                <button
                  onClick={() => setIsOpen(false)}
                  className="hover:bg-white/10 p-1.5 rounded-xl text-white/60 hover:text-white transition-all"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            {/* ── Message list ── */}
            <div className="flex flex-col flex-1 gap-3 bg-slate-50 px-4 py-4 overflow-x-hidden overflow-y-auto">
              <BubbleMessage
                  avatar={<BotMessageSquare size={11} />}
                  content={<MarkdownRenderer proseClass="prose prose-sm">Shalom! Saya AI Assistant SmartChurch. Ada insight kehadiran atau tren jemaat yang ingin Anda ketahui hari ini?</MarkdownRenderer>}
                  alignment='left'
                  avatarClass= {`bg-linear-to-br ${accent.gradient} text-white`}
                  bubbleClass='rounded-tl-sm border border-slate-100 bg-white text-slate-700 shadow-sm'
                />

              {...messages.reduce((acc, msg, i) => {
                if (!msg.data) return acc;
                const msgData = msg.data;
                const type = msg.type;
                const msgContent = msgData?.content;
                const toolCalls = msgData?.tool_calls ?? [];

                const classes = new Map([
                  ["human", {
                    avatar: <User size={11} />,
                    avatarClass: accent.userBubble,
                    bubbleClass: `rounded-tr-sm bg-linear-to-br ${accent.gradient} text-white`,
                    alignment: 'right'
                  }],
                  ["ai", {
                    avatar: <BotMessageSquare size={11} />,
                    avatarClass: `bg-linear-to-br ${accent.gradient} text-white`,
                    bubbleClass: 'rounded-tl-sm border border-slate-100 bg-white text-slate-700 shadow-sm',
                    alignment: 'left'
                  }]
                ]);

                if (!classes.has(type)) return acc;
                const styling = classes.get(type);
                for (const tc of toolCalls) {
                  acc.toolNames.add(tc.name);
                }
                const lastMessage = i === messages.length - 1;
                if (lastMessage && msgContent === "") {
                  acc.components.push(
                    <div key={i} className="flex flex-col gap-2">
                      {acc.toolNames.size > 0 && (
                        <div className="flex flex-wrap gap-2 pl-8">
                          {Array.from(acc.toolNames).map((tc, j) => {
                            if (!Object.keys(TOOL_META).includes(tc)) return null;
                            return <ToolCallPill key={`${tc}-${j}`} toolName={tc} />
                          })}
                        </div>
                      )}
                    </div>
                  );
                }
                if (!msgContent) return acc;
                acc.components.push(
                  <div key={i} className="flex flex-col gap-2">
                    {acc.toolNames.size > 0 && (
                      <div className="flex flex-wrap gap-2 pl-8">
                        {Array.from(acc.toolNames).map((tc, j) => {
                          if (!Object.keys(TOOL_META).includes(tc)) return null;
                          return <ToolCallPill key={`${tc}-${j}`} toolName={tc} />
                        })}
                      </div>
                    )}
                    {msgContent && (
                      <BubbleMessage
                        avatar={styling.avatar}
                        content={<MarkdownRenderer proseClass="prose prose-sm">{msgContent}</MarkdownRenderer>}
                        alignment={styling.alignment}
                        avatarClass={styling.avatarClass}
                        bubbleClass={styling.bubbleClass}
                      />
                    )}
                  </div>
                );
                acc.toolNames.clear();
                return acc;
              }, { components: [], toolNames: new Set() }).components}

              {/* Typing indicator — three bouncing dots */}
              {isStreaming && (
                <div className="flex self-start gap-2.5 max-w-[88%]">
                  <div className={`flex justify-center items-center bg-linear-to-br ${accent.gradient} rounded-lg w-7 h-7 text-white shrink-0`}>
                    <BotMessageSquare size={13} />
                  </div>
                  <div className="flex items-center gap-1.5 bg-white shadow-sm px-4 py-3 border border-slate-100 rounded-2xl rounded-tl-sm">
                    <span className="inline-block bg-slate-400 rounded-full w-1.5 h-1.5 animate-bounce" />
                    <span className="inline-block bg-slate-400 rounded-full w-1.5 h-1.5 animate-bounce [animation-delay:0.2s]" />
                    <span className="inline-block bg-slate-400 rounded-full w-1.5 h-1.5 animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}

              {/* Invisible anchor to scroll into view */}
              <div ref={bottomRef} />
            </div>

            {/* ── Input bar ── */}
            <div className="bg-white px-3 py-3 border-slate-100 border-t shrink-0">
              <form
                onSubmit={handleSend}
                className={`flex items-center gap-2 bg-slate-50 px-3 py-1.5 border border-slate-200 ${accent.focusBorder} rounded-xl ${accent.focusRing} transition-all`}
              >
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Tanya soal data kehadiran..."
                  className="flex-1 bg-transparent py-1.5 focus:outline-none text-slate-700 placeholder:text-slate-400 text-sm"
                />
                {/* Send button */}
                <button
                  type="submit"
                  disabled={!input.trim() || isStreaming}
                  className={`group flex justify-center items-center bg-linear-to-br ${accent.gradient} disabled:opacity-40 rounded-lg w-8 h-8 transition-all`}
                >
                  <Send size={14} className="ml-0.5 text-white transition-transform group-hover:translate-x-0.5" />
                </button>
              </form>
            </div>

          </div>
        )}

        {/* ============================================================
             FLOATING ACTION BUTTON (FAB)
             Hidden when chat is open; visible when closed.
        ============================================================ */}
        <button
          onClick={() => setIsOpen(prev => !prev)}
          aria-label="Buka AI Assistant"
          className={`before:absolute relative before:-inset-1 flex justify-center items-center ${accent.glow} bg-linear-to-br ${accent.gradient} before:opacity-70 shadow-lg rounded-full before:rounded-full w-14 h-14 text-white hover:scale-105 active:scale-95 transition-all before:animate-ping duration-200`}
        >
          {/* Toggle between bot icon (closed) and X icon (open) */}
          {isOpen
            ? <X size={22} className="text-white" />
            : <BotMessageSquare size={22} className="text-white" />
          }
        </button>

      </div>
    </>
  );
}

// const BubbleMessage = ({ avatar, content, alignment, avatarClass, bubbleClass }) => (
//   <div
//     className={`flex max-w-[88%] min-w-0 gap-2.5 ${
//       alignment === "right" ? "self-end flex-row-reverse" : "self-start"
//     }`}
//   >
//     <div
//       className={`mt-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs ${avatarClass}`}
//     >
//       {avatar}
//     </div>

//     {/* Message bubble */}
//     <div
//       className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed min-w-0 max-w-full ${bubbleClass}`}
//     >
//       {content}
//     </div>
//   </div>
// );

// const MarkdownImage = ({ src, alt }) => {
//   const [isOverlayOpen, setIsOverlayOpen] = useState(false);

//   useEffect(() => {
//     if (!isOverlayOpen) return;

//     const onKeyDown = (event) => {
//       if (event.key === 'Escape') {
//         setIsOverlayOpen(false);
//       }
//     };

//     document.addEventListener('keydown', onKeyDown);
//     return () => document.removeEventListener('keydown', onKeyDown);
//   }, [isOverlayOpen]);

//   if (!src) return null;

//   return (
//     <>
//       <div className="group inline-block relative my-2 max-w-full">
//         <img
//           src={src}
//           alt={alt || 'Image'}
//           loading="lazy"
//           className="border border-slate-200 rounded-xl max-w-full max-h-72 object-contain"
//         />

//         <button
//           type="button"
//           onClick={() => setIsOverlayOpen(true)}
//           aria-label="Perbesar gambar"
//           title="Perbesar gambar"
//           className="right-2 bottom-2 absolute flex items-center gap-1 bg-slate-900/85 hover:bg-slate-900 px-2.5 py-1.5 rounded-lg text-white text-xs transition-all"
//         >
//           <Maximize2 size={14} />
//           Zoom
//         </button>
//       </div>

//       {isOverlayOpen && (
//         <div
//           className="z-120 fixed inset-0 flex justify-center items-center bg-slate-950/80 p-4"
//           onClick={() => setIsOverlayOpen(false)}
//         >
//           <button
//             type="button"
//             onClick={() => setIsOverlayOpen(false)}
//             aria-label="Tutup gambar"
//             title="Tutup"
//             className="top-4 right-4 absolute flex items-center gap-1 bg-white/95 hover:bg-white px-3 py-2 rounded-lg text-slate-700 text-sm"
//           >
//             <X size={16} />
//             Tutup
//           </button>

//           <img
//             src={src}
//             alt={alt || 'Preview gambar'}
//             className="border border-white/20 rounded-xl max-w-[92vw] max-h-[92vh] object-contain"
//             onClick={event => event.stopPropagation()}
//           />
//         </div>
//       )}
//     </>
//   );
// };