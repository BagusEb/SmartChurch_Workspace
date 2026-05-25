import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BotMessageSquare, Menu, PanelRight } from 'lucide-react';
import HistorySidebar from '../components/AIChat/HistorySidebar';

export default function LeaderLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [canvasOpen, setCanvasOpen] = useState(false);

  const parts = pathname.split('/');
  const activeThreadId = parts[1] === 'chat' && parts[2] ? parts[2] : null;

  const handleSelectConversation = (conv) => {
    const tid = conv.thread_id || conv.langfuse_threadid;
    setSidebarOpen(false);
    setCanvasOpen(false);
    navigate('/chat/' + tid);
  };

  const handleNewChat = () => {
    setSidebarOpen(false);
    setCanvasOpen(false);
    navigate('/chat');
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/login');
    window.location.reload();
  };

  return (
    <div className="flex bg-slate-50 w-full h-screen overflow-hidden font-plus-jakarta">

      {/* Mobile sidebar backdrop */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 ${
          sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar — mobile: fixed overlay | desktop: collapsible inline */}
      <aside
        className={`
          fixed lg:relative top-0 left-0 z-50 lg:z-auto
          h-full shrink-0 overflow-hidden
          bg-white border-r border-slate-100
          transition-all duration-300
          w-72
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          ${desktopSidebarOpen ? 'lg:w-72' : 'lg:w-0 lg:border-r-0'}
        `}
      >
        <HistorySidebar
          activeThreadId={activeThreadId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          onClose={() => setSidebarOpen(false)}
          onReportClick={() => { navigate('/report'); setSidebarOpen(false); }}
          onLogout={handleLogout}
        />
      </aside>

      {/* Right side: mobile header + content */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">

        {/* Mobile-only header */}
        <header className="lg:hidden flex items-center justify-between bg-white px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1 text-slate-500 hover:text-slate-700 transition-colors"
              aria-label="Buka riwayat"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex justify-center items-center bg-linear-to-br from-indigo-500 to-violet-600 rounded-xl w-7 h-7">
                <BotMessageSquare size={13} className="text-white" />
              </div>
              <span className="font-semibold text-slate-700 text-sm">SmartChurch AI</span>
            </div>
          </div>
          {pathname.startsWith('/chat') && (
            <button
              onClick={() => setCanvasOpen(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                canvasOpen
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'hover:bg-slate-100 text-slate-600 hover:text-slate-800'
              }`}
              aria-label="Toggle canvas"
            >
              <PanelRight size={13} />
            </button>
          )}
        </header>

        {/* Main content */}
        <div className="flex flex-1 min-w-0 overflow-hidden">
          <Outlet context={{ setSidebarOpen, canvasOpen, setCanvasOpen, desktopSidebarOpen, setDesktopSidebarOpen }} />
        </div>

      </div>
    </div>
  );
}
