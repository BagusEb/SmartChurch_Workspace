import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import useChat from '../hooks/useChat';
import ChatTopBar from '../components/AdminAIChat/ChatTopBar';
import ChatMessageList from '../components/AdminAIChat/ChatMessageList';
import ChatInputBar from '../components/AdminAIChat/ChatInputBar';
import CanvasPanel from '../components/AdminAIChat/CanvasPanel';

export default function AdminAIChat() {
  const navigate = useNavigate();
  const { threadId: urlThreadId } = useParams();

  const [input, setInput] = useState('');
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [activeConvTitle, setActiveConvTitle] = useState('');

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const canvasPanelRef = useRef(null);
  const lastCanvasRef = useRef('');

  const { messages, addMessage, resetChat, setThreadId, isStreaming, threadId, conversationTitle, canvas, clearCanvas, activeToolCall } = useChat(urlThreadId ?? null);

  useEffect(() => {
    if (conversationTitle) setActiveConvTitle(conversationTitle);
  }, [conversationTitle]);

  // Reset when navigating to /chat (new chat) or a different existing thread
  useEffect(() => {
    if (!urlThreadId) {
      resetChat();
      setActiveConvTitle('');
      return;
    }
    if (urlThreadId !== threadId) {
      resetChat();
      setThreadId(urlThreadId);
      setActiveConvTitle('');
    }
  }, [urlThreadId]);

  // After streaming ends, sync URL with the newly created thread ID
  useEffect(() => {
    if (!isStreaming && threadId && !urlThreadId) {
      navigate('/chat/' + threadId, { replace: true });
    }
  }, [isStreaming]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!canvasPanelRef.current) return;
    if (canvasOpen) canvasPanelRef.current.expand();
    else canvasPanelRef.current.collapse();
  }, [canvasOpen]);

  useEffect(() => {
    if (!canvas) {
      lastCanvasRef.current = '';
      return;
    }

    const isNewCanvas = canvas !== lastCanvasRef.current;
    lastCanvasRef.current = canvas;

    if (isNewCanvas && !canvasOpen) setCanvasOpen(true);
  }, [canvas, canvasOpen]);

  const handleSelectConversation = (conv) => {
    const tid = conv.thread_id || conv.langfuse_threadid;
    setActiveConvTitle(conv.conversation_title || '');
    setCanvasOpen(false);
    navigate('/chat/' + tid);
  };

  const handleNewChat = () => {
    setActiveConvTitle('');
    setInput('');
    setCanvasOpen(false);
    navigate('/chat');
  };

  const handleSend = async (e, overrideText) => {
    e?.preventDefault();
    const userMessage = (overrideText ?? input).trim();
    if (!userMessage) return;
    setInput('');
    await addMessage(userMessage);
  };

  return (
    <Group
      orientation="horizontal"
      className="-m-8 overflow-hidden"
      style={{ height: 'calc(100% + 4rem)', width: 'calc(100% + 4rem)' }}
      onLayoutChanged={(layout) => {
        if (layout?.canvas === 0) setCanvasOpen(false);
      }}
    >
      <Panel id="chat" minSize="40%" className="flex flex-col bg-white min-w-0">
        <ChatTopBar
          activeConvTitle={activeConvTitle}
          canvasOpen={canvasOpen}
          activeThreadId={urlThreadId ?? null}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          onToggleCanvas={() => setCanvasOpen(prev => !prev)}
        />
        <div className="flex-1 px-6 py-4 overflow-y-auto">
          <ChatMessageList
            messages={messages}
            isStreaming={isStreaming}
            activeToolCall={activeToolCall}
            bottomRef={bottomRef}
            onSend={handleSend}
          />
        </div>
        <ChatInputBar
          input={input}
          setInput={setInput}
          isStreaming={isStreaming}
          inputRef={inputRef}
          onSend={handleSend}
        />
      </Panel>

      {canvasOpen && (
        <Separator className="bg-slate-200 hover:bg-indigo-400 active:bg-indigo-500 w-1.5 transition-colors cursor-col-resize" />
      )}

      <CanvasPanel
        canvas={canvas}
        panelRef={canvasPanelRef}
        onClose={() => setCanvasOpen(false)}
        onClear={clearCanvas}
      />
    </Group>
  );
}
