// ============================================================
//  Dashboard.jsx
//  Analytics dashboard wrapper component that embeds a
//  Metabase public dashboard via iframe.
//  All logic is preserved — only the visual layer is enhanced.
// ============================================================

import { useState } from 'react';

// ── Icon imports from Lucide
import {
  BarChart3,
  RefreshCw,
  Maximize2,
  ExternalLink,
  TrendingUp,
  Users,
  CalendarDays,
  Activity,
} from 'lucide-react';

export default function Dashboard() {

  // ── Replace this with your actual Metabase public dashboard URL
  const metabaseEmbedUrl =
    "http://localhost:4000/public/dashboard/91a66be4-76a1-4db1-9289-97d0ad4d0809";

  // Controls whether the iframe is in fullscreen overlay mode
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Triggers an iframe reload by toggling a key on the iframe element
  const [iframeKey, setIframeKey] = useState(0);
  const handleRefresh = () => setIframeKey(prev => prev + 1);

  // Quick-stat cards shown above the iframe — visual only, no API calls
  const stats = [
    {
      label: "Total Jemaat Hari ini",
      value: "—",
      icon: Users,
      color: "from-indigo-500 to-violet-600",
      shadow: "shadow-indigo-200",
    },
    {
      label: "Hadir Bulan Ini",
      value: "—",
      icon: CalendarDays,
      color: "from-emerald-500 to-teal-500",
      shadow: "shadow-emerald-200",
    },
    {
      label: "Rata-rata Kehadiran",
      value: "—",
      icon: TrendingUp,
      color: "from-amber-500 to-orange-500",
      shadow: "shadow-amber-200",
    },
    {
      label: "Status Sistem",
      value: "Live",
      icon: Activity,
      color: "from-rose-500 to-pink-600",
      shadow: "shadow-rose-200",
    },
  ];

  return (
    <>
      {/* ── Global styles: custom font + animations ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        /* Apply font to the entire dashboard component */
        .dash-root { font-family: 'Plus Jakarta Sans', sans-serif; }

        /* Staggered fade-up animation for stat cards on mount */
        .stat-card { animation: statFadeUp 0.5s ease both; }
        .stat-card:nth-child(1) { animation-delay: 0.05s; }
        .stat-card:nth-child(2) { animation-delay: 0.10s; }
        .stat-card:nth-child(3) { animation-delay: 0.15s; }
        .stat-card:nth-child(4) { animation-delay: 0.20s; }
        @keyframes statFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Iframe wrapper fade-in */
        .iframe-wrapper { animation: frameFadeIn 0.6s ease 0.25s both; }
        @keyframes frameFadeIn {
          from { opacity: 0; transform: scale(0.99); }
          to   { opacity: 1; transform: scale(1); }
        }

        /* Toolbar button hover ring */
        .tool-btn { transition: all 0.15s ease; }
        .tool-btn:hover {
          background: rgba(99,102,241,0.1);
          color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
        }

        /* Fullscreen overlay */
        .fullscreen-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: #0f0f1a;
          animation: overlayIn 0.2s ease;
        }
        @keyframes overlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* Animated live pulse dot */
        .live-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 0 0 rgba(16,185,129,0.5);
          animation: livePulse 1.8s infinite;
        }
        @keyframes livePulse {
          0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); }
          70%  { box-shadow: 0 0 0 7px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
        }

        /* Subtle grid texture behind the iframe area */
        .grid-bg {
          background-image:
            linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px);
          background-size: 28px 28px;
        }
      `}</style>

      {/* ── FULLSCREEN MODE: overlays the entire viewport ── */}
      {isFullscreen && (
        <div className="fullscreen-overlay flex flex-col">

          {/* Fullscreen toolbar */}
          <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <BarChart3 size={15} className="text-white" />
              </div>
              <span className="text-white font-semibold text-sm">Dashboard Analitik</span>
              <div className="flex items-center gap-1.5">
                <div className="live-dot" />
                <span className="text-emerald-400 text-xs font-medium">Live</span>
              </div>
            </div>
            {/* Exit fullscreen */}
            <button
              onClick={() => setIsFullscreen(false)}
              className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-xs font-medium transition-all"
            >
              <Maximize2 size={13} />
              Keluar Layar Penuh
            </button>
          </div>

          {/* Fullscreen iframe */}
          <div className="flex-1 relative">
            <iframe
              key={`fs-${iframeKey}`}
              src={metabaseEmbedUrl}
              frameBorder="0"
              width="100%"
              height="100%"
              className="absolute inset-0 w-full h-full"
              allowTransparency
              title="Metabase Analytics Dashboard"
            />
          </div>
        </div>
      )}

      {/* ── NORMAL MODE ── */}
      <div className="dash-root flex flex-col h-[calc(100vh-8rem)] gap-5">

        {/* ── PAGE HEADER ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

          {/* Left: icon + title + subtitle */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200 flex-shrink-0">
              <BarChart3 size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight leading-none">
                Dashboard Analitik
              </h2>
              <p className="text-slate-500 text-sm mt-1">
                Ringkasan data jemaat &amp; kehadiran · Powered by Metabase
              </p>
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">

            {/* Refresh iframe */}
            <button
              onClick={handleRefresh}
              className="tool-btn flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold"
              title="Refresh Dashboard"
            >
              <RefreshCw size={14} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Open in new tab */}
            <a
              href={metabaseEmbedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tool-btn flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold"
              title="Buka di Tab Baru"
            >
              <ExternalLink size={14} />
              <span className="hidden sm:inline">Buka</span>
            </a>

            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen(true)}
              className="tool-btn flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold"
              title="Layar Penuh"
            >
              <Maximize2 size={14} />
              <span className="hidden sm:inline">Layar Penuh</span>
            </button>
          </div>
        </div>

        {/* ── QUICK STAT CARDS (decorative, data shown in Metabase) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-shrink-0">
          {stats.map(({ label, value, icon: Icon, color, shadow }) => (
            <div
              key={label}
              className={`stat-card bg-gradient-to-br ${color} rounded-2xl p-4 text-white shadow-lg ${shadow}`}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-white/80 text-xs font-semibold uppercase tracking-wide leading-tight">
                  {label}
                </p>
                <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
                  <Icon size={13} className="text-white" />
                </div>
              </div>
              <p className="text-2xl font-extrabold">{value}</p>
              {/* Live indicator on the last card */}
              {label === "Status Sistem" && (
                <div className="mt-2 flex items-center gap-1.5">
                  <div className="live-dot" />
                  <span className="text-white/70 text-xs">Metabase Connected</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── METABASE IFRAME CARD ── */}
        <div className="flex-1 flex flex-col rounded-2xl border border-slate-200 overflow-hidden shadow-sm min-h-0 iframe-wrapper">

          {/* Card toolbar */}
          <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-3">
              {/* Decorative traffic-light dots */}
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
              </div>
              {/* URL pill */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-lg">
                <div className="live-dot" style={{ width: 6, height: 6 }} />
                <span className="text-slate-500 text-xs font-mono truncate max-w-xs">
                  {metabaseEmbedUrl}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 font-medium">Embedded via Metabase</span>
            </div>
          </div>

          {/* Iframe container with grid texture background */}
          <div className="flex-1 relative grid-bg min-h-0">
            <iframe
              key={iframeKey}
              src={metabaseEmbedUrl}
              frameBorder="0"
              width="100%"
              height="100%"
              className="absolute inset-0 w-full h-full bg-transparent"
              allowTransparency
              title="Metabase Analytics Dashboard"
            />
          </div>
        </div>

      </div>
    </>
  );
}