import { BotMessageSquare, User, Loader2 } from 'lucide-react';
import BubbleMessage from '../BubbleMessage';
import MarkdownRenderer from '../MarkdownRenderer';
import ToolCallPill, { TOOL_META } from './ToolCallPill';
import EmptyState from './EmptyState';

export default function ChatMessageList({ messages, isStreaming, activeToolCall, bottomRef, onSend }) {
  if (messages.length === 0) return <EmptyState onSend={onSend} />;

  const styleMap = {
    human: {
      avatar: <User size={12} />,
      avatarClass: 'bg-indigo-100 text-indigo-600',
      bubbleClass: 'bg-linear-to-br from-indigo-500 to-violet-600 text-white rounded-tr-sm',
      alignment: 'right',
    },
    ai: {
      avatar: <BotMessageSquare size={12} />,
      avatarClass: 'bg-linear-to-br from-indigo-500 to-violet-600 text-white',
      bubbleClass: 'bg-white border border-slate-100 text-slate-700 shadow-sm rounded-tl-sm',
      alignment: 'left',
    },
  };

  return (
    <div className="flex flex-col gap-3 mx-auto max-w-2xl">
      <BubbleMessage
        avatar={<BotMessageSquare size={12} />}
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
              <div key={i} className="flex flex-wrap gap-2 pl-7">
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
          <div key={i} className="flex flex-col gap-1.5">
            {acc.toolNames.size > 0 && (
              <div className="flex flex-wrap gap-2 pl-7">
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
            <div className="pl-7">
              <ToolCallPill toolName={activeToolCall} loading />
            </div>
          )}
          <BubbleMessage
            avatar={<BotMessageSquare size={12} />}
            content={
              <div className="flex items-center gap-1 py-0.5">
                <span className="bg-slate-400 rounded-full w-1.5 h-1.5 animate-bounce [animation-delay:0ms]" />
                <span className="bg-slate-400 rounded-full w-1.5 h-1.5 animate-bounce [animation-delay:150ms]" />
                <span className="bg-slate-400 rounded-full w-1.5 h-1.5 animate-bounce [animation-delay:300ms]" />
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
