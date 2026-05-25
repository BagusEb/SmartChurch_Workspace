import { BotMessageSquare, User } from 'lucide-react';
import BubbleMessage from '../BubbleMessage';
import MarkdownRenderer from '../MarkdownRenderer';
import ToolCallPill, { TOOL_META } from '../AdminAIChat/ToolCallPill';

const SUGGESTIONS = [
  'Tren kehadiran bulan ini?',
  'Jemaat paling aktif minggu ini?',
  'Perbandingan kehadiran bulan lalu?',
  'Ringkasan statistik ibadah?',
];

const styleMap = {
  human: {
    avatar: <User size={13} />,
    avatarClass: 'bg-indigo-100 text-indigo-600',
    bubbleClass: 'bg-linear-to-br from-indigo-500 to-violet-600 text-white rounded-tr-sm',
    alignment: 'right',
  },
  ai: {
    avatar: <BotMessageSquare size={13} />,
    avatarClass: 'bg-linear-to-br from-indigo-500 to-violet-600 text-white',
    bubbleClass: 'bg-white border border-slate-100 text-slate-700 shadow-sm rounded-tl-sm',
    alignment: 'left',
  },
};

export default function AIMessageList({ messages, isStreaming, activeToolCall, bottomRef, onSend }) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center gap-8 px-4 py-12 h-full text-center">
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
              onClick={() => onSend(null, s)}
              className="bg-white hover:bg-indigo-50 px-4 py-2 border border-slate-200 hover:border-indigo-200 rounded-xl text-slate-600 hover:text-indigo-700 text-sm transition-all"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 mx-auto px-4 sm:px-6 py-6 w-full max-w-3xl">
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

      {messages.reduce((acc, msg, i) => {
        if (!msg.data) return acc;
        const content = msg.data?.content;
        const toolCalls = msg.data?.tool_calls ?? [];
        const type = msg.type;

        if (!styleMap[type]) return acc;
        const styling = styleMap[type];

        for (const tc of toolCalls) acc.toolNames.add(tc.name);

        const isLast = i === messages.length - 1;
        if (isLast && content === '') {
          if (acc.toolNames.size > 0) {
            acc.components.push(
              <div key={i} className="flex flex-wrap gap-2 pl-8">
                {Array.from(acc.toolNames).map((tc, j) =>
                  TOOL_META[tc] ? <ToolCallPill key={`${tc}-${j}`} toolName={tc} /> : null
                )}
              </div>
            );
          }
          return acc;
        }

        if (!content) return acc;

        acc.components.push(
          <div key={i} className="flex flex-col gap-2">
            {acc.toolNames.size > 0 && (
              <div className="flex flex-wrap gap-2 pl-8">
                {Array.from(acc.toolNames).map((tc, j) =>
                  TOOL_META[tc] ? <ToolCallPill key={`${tc}-${j}`} toolName={tc} /> : null
                )}
              </div>
            )}
            <BubbleMessage
              avatar={styling.avatar}
              content={<MarkdownRenderer>{content}</MarkdownRenderer>}
              alignment={styling.alignment}
              avatarClass={styling.avatarClass}
              bubbleClass={styling.bubbleClass}
            />
          </div>
        );

        acc.toolNames.clear();
        return acc;
      }, { components: [], toolNames: new Set() }).components}

      {isStreaming && !messages.some(m => m.streaming) && (
        <div className="flex flex-col gap-2">
          {activeToolCall && (
            <div className="pl-8">
              <ToolCallPill toolName={activeToolCall} loading />
            </div>
          )}
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
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
