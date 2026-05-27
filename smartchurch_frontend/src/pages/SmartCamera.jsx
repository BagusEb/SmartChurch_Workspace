// src/pages/SmartCamera.jsx
// ──────────────────────────────────────────────────────────────
//  Halaman kamera dedicated — PURE camera display.
//  Tidak ada log, tidak ada polling interval.
//  Dibuka di tab baru dari Attendance.jsx.
//  MJPEG stream langsung via <img> tag = paling ringan.
// ──────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { getSessionStatus, getVideoFeedUrl } from '../service/apiClient';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';

export default function SmartCamera() {
  const [sessionInfo,   setSessionInfo]   = useState(null);
  const [isChecking,    setIsChecking]    = useState(true);
  const [streamError,   setStreamError]   = useState(false);
  const [isFullscreen,  setIsFullscreen]  = useState(false);
  const containerRef = useRef(null);
  const imgRef       = useRef(null);

  // ── Fetch session info once on mount ────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await getSessionStatus();
        setSessionInfo(data);
      } catch (e) {
        console.error('[SmartCamera] Status fetch failed:', e);
        setSessionInfo({ is_running: false });
      } finally {
        setIsChecking(false);
      }
    })();
  }, []);

  // ── Fullscreen API ───────────────────────────────────────────
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try {
        await containerRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } catch (e) { console.warn(e); }
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Handle back — close tab if opened by opener ─────────────
  const handleBack = () => {
    if (window.opener && !window.opener.closed) {
      window.close();
    } else {
      window.location.href = '/attendance';
    }
  };

  const videoUrl    = getVideoFeedUrl();
  const isActive    = sessionInfo?.is_running;
  const sessionName = sessionInfo?.session_name;
  const stats       = sessionInfo?.stats || {};

  // ── Loading state ────────────────────────────────────────────
  if (isChecking) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center">
        <p className="text-white/30 text-sm animate-pulse font-mono tracking-wider">
          MENGHUBUNGKAN...
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-screen h-screen bg-black relative overflow-hidden select-none"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <style>{`
        @keyframes recPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .rec-anim { animation: recPulse 1.2s ease-in-out infinite; }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        .fade-in  { animation: fadeIn 0.4s ease both; }
        .overlay-top {
          background: linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, transparent 100%);
        }
        .overlay-bottom {
          background: linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%);
        }
        .glass-tag {
          background: rgba(0,0,0,0.45);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.08);
        }
      `}</style>

      {/* ── CAMERA FEED ─────────────────────────────────────── */}
      {isActive && !streamError ? (
        <img
          ref={imgRef}
          src={videoUrl}
          alt="SmartChurch Live Camera"
          className="fade-in absolute inset-0 w-full h-full object-cover"
          style={{ display: 'block' }}
          onError={() => setStreamError(true)}
          onLoad={() => setStreamError(false)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
          {/* Scanline background effect */}
          <div className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)',
            }}
          />

          <div className="relative z-10 flex flex-col items-center gap-4 text-center px-8">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none"
              stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" strokeLinecap="round">
              <path d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
            </svg>
            <div>
              <p className="text-white/30 text-base font-semibold tracking-wide">
                {streamError
                  ? 'Stream Tidak Tersedia'
                  : 'Tidak Ada Sesi Aktif'}
              </p>
              <p className="text-white/15 text-sm mt-1.5">
                {streamError
                  ? 'Periksa koneksi ke backend Django'
                  : 'Mulai sesi dari halaman Attendance terlebih dahulu'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── TOP OVERLAY ─────────────────────────────────────── */}
      <div className="overlay-top absolute top-0 left-0 right-0 px-4 py-3 flex items-center justify-between z-20">

        {/* Back button */}
        <button onClick={handleBack}
          className="glass-tag flex items-center gap-2 text-white/80 hover:text-white px-3 py-2 rounded-xl text-sm font-semibold transition-colors">
          <ArrowLeft size={15} />
          <span className="hidden sm:inline">Kembali</span>
        </button>

        {/* Center: Session name */}
        <div className="glass-tag flex items-center gap-2.5 px-4 py-2 rounded-xl">
          {isActive ? (
            <>
              <span className="w-2 h-2 rounded-full bg-red-500 rec-anim flex-shrink-0" />
              <span className="text-white text-sm font-bold truncate max-w-[200px]">
                {sessionName || 'Sesi Aktif'}
              </span>
              <span className="text-white/30 text-xs">|</span>
              <span className="text-white/50 text-xs font-mono font-bold tracking-wider">LIVE</span>
            </>
          ) : (
            <span className="text-white/30 text-sm font-semibold">No Session</span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Fullscreen toggle */}
          <button onClick={toggleFullscreen}
            className="glass-tag p-2 rounded-xl text-white/60 hover:text-white transition-colors">
            {isFullscreen
              ? <Minimize2 size={16} />
              : <Maximize2 size={16} />}
          </button>

          {/* Branding */}
          <div className="glass-tag hidden sm:flex items-center px-3 py-2 rounded-xl">
            <span className="text-white/40 text-xs font-extrabold tracking-widest">
              SMART<span className="text-indigo-400/70">CHURCH</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── BOTTOM OVERLAY: Stats ────────────────────────────── */}
      {isActive && (
        <div className="overlay-bottom absolute bottom-0 left-0 right-0 px-4 pb-4 pt-8 flex items-end justify-between z-20">

          {/* Stats pills */}
          <div className="flex items-center gap-2">
            {[
              { label: 'Dikenali',  val: stats.known     || 0, color: 'text-emerald-400', dot: 'bg-emerald-400' },
              { label: 'Ambiguous', val: stats.ambiguous || 0, color: 'text-amber-400',   dot: 'bg-amber-400'   },
              { label: 'Unknown',   val: stats.unknown   || 0, color: 'text-rose-400',    dot: 'bg-rose-400'    },
            ].map(s => (
              <div key={s.label}
                className="glass-tag flex items-center gap-2 px-3 py-2 rounded-xl">
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                <span className={`text-lg font-extrabold ${s.color}`}>{s.val}</span>
                <span className="text-white/40 text-xs hidden sm:inline">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Camera label */}
          <div className="glass-tag px-3 py-2 rounded-xl">
            <span className="text-white/40 text-xs font-mono">CAM_01 · MAIN_DOOR</span>
          </div>
        </div>
      )}

      {/* ── REC badge ─────────────────────────────────────────── */}
      {isActive && (
        <div className="absolute top-16 right-4 glass-tag flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg z-20 rec-anim">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span className="text-white text-xs font-bold font-mono">REC</span>
        </div>
      )}

      {/* ── Stream error retry ─────────────────────────────────── */}
      {streamError && isActive && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={() => {
              setStreamError(false);
              // Force img reload by appending timestamp
              if (imgRef.current) {
                imgRef.current.src = `${videoUrl}?t=${Date.now()}`;
              }
            }}
            className="glass-tag text-white/70 hover:text-white text-xs px-4 py-2 rounded-xl transition-colors font-semibold">
            ↻ Reconnect Stream
          </button>
        </div>
      )}
    </div>
  );
}