// ============================================================
//  Layout.jsx
//  Main application shell — contains the sidebar navigation
//  and the top header. Page content is injected via <Outlet />.
//  All routing logic is preserved; only the UI is enhanced.
// ============================================================

import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  ChevronRight,
  Bell,
  Settings,
  LogOut,
  Church,
  UserCog,
  UserSearch,
  FileText,
  BotMessageSquare,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/',            label: 'Dashboard',        icon: LayoutDashboard },
  { to: '/members',     label: 'Data Jemaat',      icon: Users           },
  { to: '/attendance',  label: 'Kehadiran (CCTV)', icon: UserCheck       },
  { to: '/validation',  label: 'Validasi AI',      icon: UserSearch      },
  { to: '/report',      label: 'Laporan',          icon: FileText        },
  { to: '/manage-users',label: 'Kelola Pengguna',  icon: UserCog         },
  { to: '/chat',        label: 'AI Assistant',     icon: BotMessageSquare },
];

const PAGE_TITLES = {
  '/':             'Dashboard Analitik',
  '/members':      'Data Jemaat',
  '/attendance':   'Kehadiran (CCTV)',
  '/manage-users': 'Manajemen Pengguna',
  '/validation':   'Validasi AI',
  '/report':       'Laporan Kehadiran',
  '/chat':         'AI Assistant',
};

// --- UPDATE 1: Menangkap prop 'role' dari App.jsx ---
export default function Layout({ role }) {

  const { pathname } = useLocation();
  const navigate = useNavigate(); 
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const pageTitle = PAGE_TITLES[pathname] ?? 'SmartChurch';

  // --- UPDATE 2: Filter Menu Berdasarkan Role ---
  // Logika sesuai dokumen: Admin pegang data, Leader pegang AI Assistant
  const filteredNavItems = NAV_ITEMS.filter(item => {
    if (item.to === '/') return true; // Semua role bisa lihat Dashboard
    
    if (role === 'admin') {
        return item.to === '/members' || item.to === '/attendance' || item.to === '/validation' || item.to === '/manage-users' || item.to === '/report' || item.to === '/chat';    }

    if (role === 'leader') {
        return item.to === '/report' ;    }

    return false;
  });

  // --- UPDATE 3: Data Profil Dinamis ---
  const profileData = {
    name: role === 'leader' ? 'Church Leader' : 'Administrator',
    subText: role === 'leader' ? 'Pastor' : 'Committee',
    initial: role === 'leader' ? 'P' : 'A'
  };

  // Fungsi Logout agar tombol LogOut berfungsi
  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/login');
    window.location.reload(); // Refresh state aplikasi
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        .layout-root * { font-family: 'Plus Jakarta Sans', sans-serif; }
        .nav-active {
          background: rgba(255,255,255,0.12);
          border-left: 3px solid #a5b4fc;
          color: #fff;
        }
        .nav-item:not(.nav-active):hover {
          background: rgba(255,255,255,0.07);
          color: #e0e7ff;
        }
        .sidebar-bg {
          background: linear-gradient(180deg, #1e1b4b 0%, #312e81 40%, #3730a3 100%);
        }
        .logo-glow {
          box-shadow: 0 0 20px rgba(165,180,252,0.35);
        }
        .header-shadow {
          box-shadow: 0 1px 0 0 #e2e8f0, 0 4px 16px rgba(0,0,0,0.04);
        }
        .notif-pulse {
          animation: notifPulse 2s infinite;
        }
        @keyframes notifPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50%       { box-shadow: 0 0 0 5px rgba(239,68,68,0);  }
        }
        .breadcrumb { animation: breadFadeIn 0.3s ease; }
        @keyframes breadFadeIn {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .content-area { animation: contentFade 0.25s ease; }
        @keyframes contentFade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
      `}</style>

      <div className="flex bg-slate-100 h-screen overflow-hidden layout-root">

        <aside className="relative flex flex-col w-64 shrink-0 sidebar-bg">
          <div
            aria-hidden
            style={{
              position: 'absolute', top: -40, right: -40,
              width: 160, height: 160, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(129,140,248,0.25) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          <div className="flex items-center gap-3 px-6 py-6 border-white/10 border-b">
            <div className="flex justify-center items-center bg-linear-to-br from-indigo-400 to-violet-500 rounded-xl w-10 h-10 shrink-0 logo-glow">
              <Church size={20} className="text-white" />
            </div>
            <div className="leading-tight">
              <p className="font-extrabold text-white text-lg tracking-tight">
                Smart<span className="text-indigo-300">Church</span>
              </p>
              <p className="font-medium text-indigo-300/70 text-xs">Management System</p>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-5 overflow-y-auto">
            <p className="mb-3 px-3 font-bold text-indigo-300/50 text-xs uppercase tracking-widest">
              Menu Utama
            </p>

            {/* --- UPDATE: Mapping dari menu yang sudah di-filter --- */}
            {filteredNavItems.map(({ to, label, icon: Icon }) => {
              const isActive = pathname === to || (to !== '/' && pathname.startsWith(to + '/'));

              return (
                <Link
                  key={to}
                  to={to}
                  className={`nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 border-l-3 ${
                    isActive
                      ? 'nav-active'
                      : 'text-indigo-200/80 border-l-transparent'
                  }`}
                  style={{ borderLeftWidth: isActive ? 3 : 0 }}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                    isActive
                      ? 'bg-white/20'
                      : 'bg-white/5'
                  }`}>
                    <Icon size={16} className={isActive ? 'text-indigo-200' : 'text-indigo-300/70'} />
                  </div>
                  <span className="flex-1">{label}</span>
                  {isActive && (
                    <ChevronRight size={14} className="text-indigo-300/70" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-2 px-4 py-4 border-white/10 border-t">
            <div className="flex items-center gap-3 hover:bg-white/5 px-2 py-2 rounded-xl transition-all cursor-pointer">
              <div className="flex justify-center items-center bg-linear-to-br from-indigo-400 to-violet-500 rounded-xl w-8 h-8 font-bold text-white text-xs shrink-0">
                {profileData.initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-xs truncate">{profileData.name}</p>
                <p className="text-indigo-300/60 text-xs truncate">{profileData.subText}</p>
              </div>
              
              {/* --- UPDATE: Tombol Logout berfungsi --- */}
              <button onClick={handleLogout} title="Logout" className="hover:bg-white/10 p-1 rounded">
                <LogOut size={14} className="text-indigo-300 hover:text-red-400 transition-colors shrink-0" />
              </button>
            </div>

            <p className="text-indigo-300/40 text-xs text-center">
              © 2026 Capstone Project
            </p>
          </div>
        </aside>

        <main className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <header className="z-10 flex justify-between items-center bg-white header-shadow px-8 h-16 shrink-0">
            <div className="flex items-center gap-2 text-sm breadcrumb">
              <span className="font-medium text-slate-400">SmartChurch</span>
              <ChevronRight size={14} className="text-slate-300" />
              <span className="font-semibold text-slate-700">{pageTitle}</span>
            </div>

            <div className="flex items-center gap-2">
              <button className="relative flex justify-center items-center bg-slate-100 hover:bg-slate-200 rounded-xl w-9 h-9 text-slate-500 transition-all">
                <Bell size={16} />
                <span className="top-1.5 right-1.5 absolute bg-red-500 border-2 border-white rounded-full w-2 h-2 notif-pulse" />
              </button>

              <button className="flex justify-center items-center bg-slate-100 hover:bg-slate-200 rounded-xl w-9 h-9 text-slate-500 transition-all">
                <Settings size={16} />
              </button>

              <div className="bg-slate-200 mx-1 w-px h-6" />

              <div className="flex items-center gap-2.5">
                <div className="flex justify-center items-center bg-linear-to-br from-indigo-500 to-violet-600 shadow-sm rounded-xl w-8 h-8 font-bold text-white text-xs">
                  {profileData.initial}
                </div>
                <div className="hidden sm:block leading-tight">
                  <p className="font-semibold text-slate-700 text-sm leading-none">{profileData.name}</p>
                  <p className="mt-0.5 text-slate-400 text-xs">{profileData.subText}</p>
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 p-8 overflow-auto content-area">
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
}