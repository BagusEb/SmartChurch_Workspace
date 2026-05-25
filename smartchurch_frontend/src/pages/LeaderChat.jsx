import { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { BotMessageSquare, Send, Loader2, PanelRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import useChat from '../hooks/useChat';
import AIMessageList from '../components/AIChat/AIMessageList';
import AICanvasPanel from '../components/AIChat/AICanvasPanel';

export default function LeaderChat() {
  const navigate = useNavigate();
  const { threadId: urlThreadId } = useParams();

  const [input, setInput] = useState('');
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const canvasPanelRef = useRef(null);
  const lastCanvasRef = useRef('');

  const { setSidebarOpen, canvasOpen, setCanvasOpen, desktopSidebarOpen, setDesktopSidebarOpen } = useOutletContext();
  const { messages, addMessage, resetChat, setThreadId, isStreaming, threadId, canvas, clearCanvas, activeToolCall } = useChat(urlThreadId ?? null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!urlThreadId) {
      resetChat();
      return;
    }
    if (urlThreadId !== threadId) {
      resetChat();
      setThreadId(urlThreadId);
    }
  }, [urlThreadId]);

  useEffect(() => {
    if (!isStreaming && threadId && !urlThreadId) {
      navigate('/chat/' + threadId, { replace: true });
    }
  }, [isStreaming]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!canvas) {
      lastCanvasRef.current = '';
      return;
    }

    const isNewCanvas = canvas !== lastCanvasRef.current;
    lastCanvasRef.current = canvas;

    if (isNewCanvas && !canvasOpen) {
      setCanvasOpen(true);
    }
  }, [canvas, canvasOpen]);

  useEffect(() => {
    if (!canvasPanelRef.current || !isDesktop) return;
    if (canvasOpen) canvasPanelRef.current.expand();
    else canvasPanelRef.current.collapse();
  }, [canvasOpen, isDesktop]);

  const handleSend = async (e, overrideText) => {
    e?.preventDefault();
    const userMessage = (overrideText ?? input).trim();
    if (!userMessage) return;
    setInput('');
    await addMessage(userMessage);
  };

  return (
    <>
      <Group
        orientation="horizontal"
        className="flex-1 min-w-0 overflow-hidden"
        onLayoutChanged={(layout) => {
          if (layout?.canvas === 0) setCanvasOpen(false);
        }}
      >

        {/* Chat panel */}
        <Panel id="chat" minSize={"40%"} className="flex flex-col bg-white min-w-0">

          {/* Desktop header */}
          <header className="hidden lg:flex justify-between items-center bg-white px-6 py-3 border-slate-100 border-b shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDesktopSidebarOpen(prev => !prev)}
                title={desktopSidebarOpen ? 'Sembunyikan riwayat' : 'Tampilkan riwayat'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  desktopSidebarOpen
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'hover:bg-slate-100 text-slate-600 hover:text-slate-800'
                }`}
              >
                {desktopSidebarOpen
                  ? <PanelLeftClose size={13} />
                  : <PanelLeftOpen size={13} />
                }
              </button>
              <div className="flex items-center gap-2">
                <div className="flex justify-center items-center bg-linear-to-br from-indigo-500 to-violet-600 rounded-xl w-7 h-7">
                  <BotMessageSquare size={13} className="text-white" />
                </div>
                <span className="font-semibold text-slate-700 text-sm">SmartChurch AI</span>
              </div>
            </div>
            <button
              onClick={() => setCanvasOpen(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                canvasOpen
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'hover:bg-slate-100 text-slate-600 hover:text-slate-800'
              }`}
            >
              <PanelRight size={13} />
              <span className="hidden sm:inline">Canvas</span>
            </button>
          </header>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            <AIMessageList
              messages={messages}
              isStreaming={isStreaming}
              activeToolCall={activeToolCall}
              bottomRef={bottomRef}
              onSend={handleSend}
            />
          </div>

          {/* Input bar */}
          <div className="bg-white px-4 sm:px-6 py-4 border-slate-100 border-t shrink-0">
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
                className="flex-1 bg-transparent py-1.5 focus:outline-none text-slate-700 placeholder:text-slate-400 text-sm"
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

        </Panel>

        {/* Desktop resize handle — only when canvas open */}
        {isDesktop && canvasOpen && (
          <Separator className="bg-slate-200 hover:bg-indigo-400 active:bg-indigo-500 w-1.5 transition-colors cursor-col-resize" />
        )}

        {/* Desktop canvas panel */}
        <Panel
          panelRef={canvasPanelRef}
          id="canvas"
          defaultSize={isDesktop ? "30%" : "0"}
          minSize={isDesktop ? "20%" : "0"}
          maxSize={isDesktop ? "60%" : "0"}
          collapsible
          collapsedSize={0}
          className={`flex flex-col bg-white border-slate-100 border-l`}
        >
          <AICanvasPanel canvas={canvas} onClose={() => setCanvasOpen(false)} onClear={clearCanvas} />
        </Panel>

      </Group>

      {/* Mobile canvas backdrop */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 ${
          canvasOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setCanvasOpen(false)}
      />

      {/* Mobile canvas overlay */}
      <div className={`
        lg:hidden fixed top-0 right-0 z-50
        h-full w-72 sm:w-80
        bg-white border-l border-slate-100
        transition-transform duration-300
        ${canvasOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <AICanvasPanel canvas={canvas} onClose={() => setCanvasOpen(false)} />
      </div>
    </>
  );
}
