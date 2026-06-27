// src/pages/Attendance.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  startSession,
  stopSession,
  getDetectionLogs,
  getSessionStatus,
  getSessionAttendanceResult,
  openCameraConfigurator,
  getCameraConfiguratorStatus,
} from '../service/apiClient';

import {
  Camera,
  Play,
  Square,
  CheckCircle,
  AlertCircle,
  Clock,
  Radio,
  ShieldAlert,
  Eye,
  Loader2,
  X,
  Tag,
  CalendarDays,
  ExternalLink,
  Timer,
  UserCheck,
  Wifi,
  Users,
  Settings
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────
const formatDateLong = () =>
  new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

const formatTimeShort = (iso) => {
  if (!iso) return '--:--';

  try {
    return new Date(iso).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '--:--';
  }
};

const getDuration = (startIso, endIso) => {
  if (!startIso || !endIso) return '—';

  const diff = Math.floor((new Date(endIso) - new Date(startIso)) / 1000);

  if (Number.isNaN(diff) || diff < 0) return '—';

  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);

  if (h > 0) return `${h}j ${m}m`;
  return `${m} menit`;
};

const getDefaultStats = (mode = 'attendance') => {
  if (mode === 'registration') {
    return {
      detected: 0,
      stored: 0,
      skipped_same_track: 0,
    };
  }

  return {
    known: 0,
    ambiguous: 0,
    unknown: 0,
  };
};

// ═══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function Attendance() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [currentSession, setCurrentSession] = useState(null);
  const [currentMode, setCurrentMode] = useState('idle'); // idle | attendance | registration

  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isStopConfirmOpen, setIsStopConfirmOpen] = useState(false);
  const [isStopResultOpen, setIsStopResultOpen] = useState(false);
  const [stoppedSessionData, setStoppedSessionData] = useState(null);

  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const [isOpeningCameraConfig, setIsOpeningCameraConfig] =
    useState(false);

  const [
    isCameraConfiguratorRunning,
    setIsCameraConfiguratorRunning,
  ] = useState(false);

  const [isBackendReloading, setIsBackendReloading] =
    useState(false);

  const [inputName, setInputName] = useState('');
  const [inputError, setInputError] = useState('');

  const [liveLogs, setLiveLogs] = useState([]);
  const [stats, setStats] = useState(getDefaultStats('attendance'));
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const pollingRef = useRef(null);

  const cameraConfigPollingRef = useRef(null);
  const logsEndRef = useRef(null);

  const isRegistrationMode = currentMode === 'registration';

  const totalDetections = isRegistrationMode
    ? Number(stats.detected || 0)
    : Number(stats.known || 0) +
      Number(stats.ambiguous || 0) +
      Number(stats.unknown || 0);

  const secondCardValue = isRegistrationMode
    ? Number(stats.stored || 0)
    : Number(stats.known || 0);

  const thirdCardValue = isRegistrationMode
    ? Number(stats.skipped_same_track || 0)
    : Number(stats.ambiguous || 0) + Number(stats.unknown || 0);

  const secondCardProgress = totalDetections
    ? Math.round((secondCardValue / totalDetections) * 100)
    : 0;

  const cameraMiniStats = isRegistrationMode
    ? [
        {
          label: 'Detected',
          val: stats.detected || 0,
          color: 'text-indigo-400',
        },
        {
          label: 'Stored',
          val: stats.stored || 0,
          color: 'text-emerald-400',
        },
        {
          label: 'Skipped',
          val: stats.skipped_same_track || 0,
          color: 'text-amber-400',
        },
      ]
    : [
        {
          label: 'Known',
          val: stats.known || 0,
          color: 'text-emerald-400',
        },
        {
          label: 'Ambiguous',
          val: stats.ambiguous || 0,
          color: 'text-amber-400',
        },
        {
          label: 'Unknown',
          val: stats.unknown || 0,
          color: 'text-rose-400',
        },
      ];

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveLogs]);


  const startPolling = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const data = await getDetectionLogs();

        if (data?.mode) {
          setCurrentMode(data.mode);
        }

        if (data.logs?.length > 0) {
          setLiveLogs((prev) => {
            const newLogs = data.logs.filter(
              (nl) =>
                !prev.some(
                  (ol) =>
                    ol.time === nl.time &&
                    ol.name === nl.name &&
                    ol.similarity === nl.similarity &&
                    ol.status === nl.status
                )
            );

            if (newLogs.length === 0) return prev;

            const combined = [...prev, ...newLogs];
            return combined.length > 300 ? combined.slice(-300) : combined;
          });
        }

        if (data.stats) {
          setStats(data.stats);
        }
      } catch (e) {
        console.error('[Attendance] Polling error:', e);
      }
    }, 1000);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const stopCameraConfiguratorPolling = useCallback(() => {
    if (cameraConfigPollingRef.current) {
      clearInterval(cameraConfigPollingRef.current);
      cameraConfigPollingRef.current = null;
    }
  }, []);


  const startCameraConfiguratorPolling = useCallback(
    (expectedStartedAt) => {
      stopCameraConfiguratorPolling();

      const pollCameraConfigurator = async () => {
        try {
          const response =
            await getCameraConfiguratorStatus();

          const configState = response?.state;

          setIsBackendReloading(false);

          if (!configState) {
            return;
          }

          // Pastikan status ini berasal dari proses yang baru dibuka,
          // bukan proses configurator sebelumnya.
          if (
            expectedStartedAt &&
            configState.last_started_at !== expectedStartedAt
          ) {
            return;
          }

          setIsCameraConfiguratorRunning(
            Boolean(configState.is_running)
          );

          if (configState.is_running) {
            setInfo(
              'Camera Configurator sedang berjalan di komputer server. ' +
                'Selesaikan pengaturan lalu tutup aplikasinya.'
            );
            return;
          }

          if (configState.last_finished_at) {
            stopCameraConfiguratorPolling();

            setIsCameraConfiguratorRunning(false);
            setIsBackendReloading(false);

            if (configState.reload_triggered) {
              setInfo(
                'Konfigurasi kamera berhasil disimpan dan backend ' +
                  'sudah aktif kembali dengan konfigurasi baru.'
              );
            } else {
              setInfo(
                configState.message ||
                  'Camera Configurator telah ditutup.'
              );
            }
          }
        } catch (pollError) {
          /*
           * Saat config.py disentuh, Django runserver berhenti
           * sebentar dan memulai ulang. Pada periode itu request
           * status dapat gagal. Ini kondisi yang diharapkan.
           */
          console.warn(
            '[Attendance] Backend sedang reload:',
            pollError
          );

          setIsBackendReloading(true);
          setInfo(
            'Konfigurasi selesai. Backend sedang memuat ulang...'
          );
        }
      };

      cameraConfigPollingRef.current = setInterval(
        pollCameraConfigurator,
        1000
      );

      void pollCameraConfigurator();
    },
    [stopCameraConfiguratorPolling]
  );

  useEffect(() => {
    return () => {
      stopCameraConfiguratorPolling();
    };
  }, [stopCameraConfiguratorPolling]);
  
  useEffect(() => {
    (async () => {
      try {
        const data = await getSessionStatus();

        if (data.is_running) {
          const mode = data.mode || 'attendance';

          setIsSessionActive(true);
          setCurrentMode(mode);
          setStats(data.stats || getDefaultStats(mode));

          setCurrentSession({
            id: data.session_id,
            name:
              data.session_name ||
              data.registration_name ||
              (mode === 'registration'
                ? 'Initial Face Registration'
                : 'Sesi Berjalan'),
            start_time: data.started_at || data.start_time || null,
            mode,
          });

          if (mode === 'registration') {
            setInfo(
              'Mode registration sedang berjalan. Data wajah akan disimpan sebagai staging dan belum masuk attendance.'
            );
          }

          startPolling();
        } else {
          setIsSessionActive(false);
          setCurrentMode('idle');
          setCurrentSession(null);
          setStats(getDefaultStats('attendance'));
        }
      } catch (e) {
        console.warn('[Attendance] Status check failed:', e);
      }
    })();

    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // ── Handlers ─────────────────────────────────────────────────
  const handleOpenStartModal = () => {
    setInputName('');
    setInputError('');
    setIsStartModalOpen(true);
  };

  const handleConfirmStart = async () => {
    if (!inputName.trim()) {
      setInputError('Nama sesi wajib diisi');
      return;
    }

    setInputError('');
    setIsStarting(true);

    try {
      const res = await startSession(inputName.trim());

      if (res.success) {
        const mode = res.mode || 'attendance';

        setIsSessionActive(true);
        setCurrentMode(mode);

        setCurrentSession({
          id: res.session_id,
          name:
            res.session_name ||
            (mode === 'registration'
              ? `Registration - ${inputName.trim()}`
              : inputName.trim()),
          start_time: new Date().toISOString(),
          mode,
        });

        setLiveLogs([]);
        setStats(getDefaultStats(mode));
        setIsStartModalOpen(false);
        setError(null);

        if (mode === 'registration') {
          setInfo(
            res.message ||
              'Mode registration dimulai. Data ini hanya untuk pengumpulan wajah dan belum masuk attendance.'
          );
        } else {
          setInfo(null);
        }

        startPolling();
      } else {
        setInputError(res.message || 'Gagal memulai sesi');
      }
    } catch (e) {
      setInputError('Gagal menghubungi server. Pastikan backend berjalan.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleOpenStopConfirm = () => {
    setIsStopConfirmOpen(true);
  };

  const handleConfirmStop = async () => {
    setIsStopConfirmOpen(false);
    setIsStopping(true);

    const sessionIdSnap = currentSession?.id;
    const sessionNameSnap = currentSession?.name;
    const startTimeSnap = currentSession?.start_time;
    const modeSnap = currentMode;
    const statsSnap = stats;
    const endTimeSnap = new Date().toISOString();

    try {
      const res = await stopSession();

      if (res.success) {
        stopPolling();

        setIsSessionActive(false);
        setCurrentSession(null);
        setCurrentMode('idle');
        setError(null);
        setInfo(null);

        let apiResult = null;

        if (modeSnap === 'attendance' && sessionIdSnap) {
          try {
            apiResult = await getSessionAttendanceResult(sessionIdSnap);
          } catch (fetchErr) {
            console.warn('[Attendance] Gagal fetch attendance result:', fetchErr);
          }
        }

        setStoppedSessionData({
          mode: modeSnap,
          sessionName: sessionNameSnap,
          startTime: startTimeSnap,
          endTime: endTimeSnap,
          apiResult,
          stats: statsSnap,
        });

        setLiveLogs([]);
        setStats(getDefaultStats('attendance'));
        setIsStopResultOpen(true);
      } else {
        setError(res.message || 'Gagal menghentikan sesi');
      }
    } catch (e) {
      setError('Gagal menghubungi server saat menghentikan sesi.');
    } finally {
      setIsStopping(false);
    }
  };

  const handleOpenCamera = () => {
    window.open('/camera', '_blank', 'noopener,noreferrer');
  };

  const handleOpenCameraConfigurator = async () => {
    if (isSessionActive) {
      setError(
        'Setting Camera hanya dapat dibuka ketika tidak ada sesi aktif.'
      );
      return;
    }

    setIsOpeningCameraConfig(true);
    setError(null);
    setInfo(null);

    try {
      const response = await openCameraConfigurator();

      if (!response?.success) {
        setError(
          response?.message ||
            'Gagal membuka Camera Configurator.'
        );
        return;
      }

      const startedAt =
        response?.state?.last_started_at || null;

      setIsCameraConfiguratorRunning(true);

      setInfo(
        'Camera Configurator berhasil dibuka di komputer server. ' +
          'Atur posisi kamera lalu tutup aplikasi menggunakan tombol X.'
      );

      startCameraConfiguratorPolling(startedAt);
    } catch (requestError) {
      console.error(
        '[Attendance] Open camera configurator error:',
        requestError
      );

      const responseMessage =
        requestError?.response?.data?.message;

      setError(
        responseMessage ||
          'Gagal membuka Camera Configurator. ' +
            'Pastikan backend dan file EXE tersedia.'
      );
    } finally {
      setIsOpeningCameraConfig(false);
    }
  };

  // ═════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════
  return (
    <>
      <style>{`
        @keyframes recPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .rec-anim { animation: recPulse 1.1s ease-in-out infinite; }
        @keyframes logFade { from{opacity:0;transform:translateX(8px)} to{opacity:1;transform:translateX(0)} }
        .log-item { animation: logFade 0.22s ease both; }
        @keyframes modalIn { from{opacity:0;transform:scale(0.96) translateY(4px)} to{opacity:1;transform:scale(1) translateY(0)} }
        .modal-enter { animation: modalIn 0.22s ease both; }
        .log-scroll::-webkit-scrollbar { width: 4px; }
        .log-scroll::-webkit-scrollbar-track { background: transparent; }
        .log-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
        .btn-start  { background: linear-gradient(135deg,#6366f1,#4f46e5); transition: all 0.2s; }
        .btn-start:hover  { background: linear-gradient(135deg,#4f46e5,#4338ca); box-shadow: 0 4px 16px rgba(99,102,241,0.4); transform: translateY(-1px); }
        .btn-end    { background: linear-gradient(135deg,#f43f5e,#e11d48); transition: all 0.2s; }
        .btn-end:hover    { background: linear-gradient(135deg,#e11d48,#be123c); box-shadow: 0 4px 16px rgba(244,63,94,0.4); transform: translateY(-1px); }
        .btn-camera { background: linear-gradient(135deg,#0ea5e9,#0284c7); transition: all 0.2s; }
        .btn-camera:hover { background: linear-gradient(135deg,#0284c7,#0369a1); box-shadow: 0 4px 16px rgba(14,165,233,0.4); transform: translateY(-1px); }
        .btn-success { background: linear-gradient(135deg,#10b981,#059669); transition: all 0.2s; }
        .btn-success:hover { background: linear-gradient(135deg,#059669,#047857); box-shadow: 0 4px 16px rgba(16,185,129,0.4); }
      `}</style>

      <div
        className="flex flex-col h-full gap-5"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {/* ── PAGE HEADER ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: isSessionActive
                  ? isRegistrationMode
                    ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                    : 'linear-gradient(135deg,#10b981,#059669)'
                  : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                boxShadow: isSessionActive
                  ? isRegistrationMode
                    ? '0 4px 16px rgba(245,158,11,0.35)'
                    : '0 4px 16px rgba(16,185,129,0.35)'
                  : '0 4px 16px rgba(99,102,241,0.35)',
                transition: 'all 0.4s ease',
              }}
            >
              <Camera size={22} className="text-white" />
            </div>

            <div>
              <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">
                Live Attendance Monitoring
              </h2>
              <p className="text-slate-500 text-sm mt-0.5">
                Pantau log deteksi wajah dan statistik kamera secara real-time
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {!isSessionActive && (
              <button
                type="button"
                onClick={handleOpenCameraConfigurator}
                disabled={
                  isOpeningCameraConfig ||
                  isCameraConfiguratorRunning ||
                  isBackendReloading
                }
                className="
                  inline-flex items-center gap-2
                  px-4 py-2 rounded-xl
                  border border-indigo-200
                  bg-indigo-50 text-indigo-700
                  text-sm font-semibold
                  hover:bg-indigo-100
                  hover:border-indigo-300
                  transition-all
                  disabled:opacity-60
                  disabled:cursor-not-allowed
                "
              >
                {isOpeningCameraConfig ||
                isCameraConfiguratorRunning ||
                isBackendReloading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Settings size={15} />
                )}

                {isOpeningCameraConfig
                  ? 'Membuka...'
                  : isCameraConfiguratorRunning
                  ? 'Configurator Aktif'
                  : isBackendReloading
                  ? 'Backend Reload...'
                  : 'Setting Camera Position'}
              </button>
            )}

            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold flex-shrink-0 transition-all ${
                isSessionActive
                  ? isRegistrationMode
                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-slate-100 border-slate-200 text-slate-500'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isSessionActive
                    ? isRegistrationMode
                      ? 'bg-amber-500 rec-anim'
                      : 'bg-emerald-500 rec-anim'
                    : 'bg-slate-400'
                }`}
              />

              {isSessionActive
                ? isRegistrationMode
                  ? `REGISTRATION — ${
                      currentSession?.name || 'Face Registration'
                    }`
                  : `AKTIF — ${
                      currentSession?.name || 'Sesi Berjalan'
                    }`
                : 'TIDAK ADA SESI AKTIF'}
            </div>
          </div>
        </div>

        {/* ── ERROR BANNER ── */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0" />
              {error}
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── INFO BANNER ── */}
        {info && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <ShieldAlert size={15} className="flex-shrink-0" />
              {info}
            </div>
            <button
              onClick={() => setInfo(null)}
              className="text-amber-500 hover:text-amber-700 flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-3 gap-4 flex-shrink-0">
          <div
            className="rounded-2xl p-4 text-white"
            style={{
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              boxShadow: '0 4px 14px rgba(99,102,241,0.25)',
            }}
          >
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide">
              {isRegistrationMode ? 'Wajah Terdeteksi' : 'Total Deteksi'}
            </p>
            <p className="text-3xl font-extrabold mt-1">{totalDetections}</p>
            <div className="mt-1.5 flex items-center gap-1">
              <Eye size={12} className="text-indigo-300" />
              <span className="text-indigo-200 text-xs">
                {isRegistrationMode ? 'Face events' : 'Events terekam'}
              </span>
            </div>
          </div>

          <div
            className="rounded-2xl p-4 text-white"
            style={{
              background: 'linear-gradient(135deg,#10b981,#059669)',
              boxShadow: '0 4px 14px rgba(16,185,129,0.25)',
            }}
          >
            <p className="text-emerald-200 text-xs font-semibold uppercase tracking-wide">
              {isRegistrationMode ? 'Tersimpan' : 'Dikenali'}
            </p>
            <p className="text-3xl font-extrabold mt-1">{secondCardValue}</p>
            <div className="mt-1.5 w-full bg-emerald-400/30 rounded-full h-1.5">
              <div
                className="bg-white rounded-full h-1.5 transition-all duration-500"
                style={{ width: `${secondCardProgress}%` }}
              />
            </div>
          </div>

          <div
            className="rounded-2xl p-4 text-white"
            style={{
              background: 'linear-gradient(135deg,#f59e0b,#d97706)',
              boxShadow: '0 4px 14px rgba(245,158,11,0.25)',
            }}
          >
            <p className="text-amber-200 text-xs font-semibold uppercase tracking-wide">
              {isRegistrationMode ? 'Skip Track Sama' : 'Perlu Validasi'}
            </p>
            <p className="text-3xl font-extrabold mt-1">{thirdCardValue}</p>
            <div className="mt-1.5 flex items-center gap-1">
              <ShieldAlert size={12} className="text-amber-200" />
              <span className="text-amber-200 text-xs">
                {isRegistrationMode ? 'Duplikasi realtime' : 'Tamu / Ambigu'}
              </span>
            </div>
          </div>
        </div>

        {/* ── MAIN AREA ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 flex-1 min-h-0">
          {/* LEFT */}
          <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
            <div
              className="flex-1 rounded-2xl overflow-hidden relative border border-slate-800 min-h-[300px] flex flex-col items-center justify-center"
              style={{ background: '#08080f' }}
            >
              <div
                className="absolute top-4 left-4 text-white text-xs px-2.5 py-1 rounded-lg font-mono z-10"
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(4px)',
                }}
              >
                CAM_01 · MAIN_DOOR
              </div>

              {isSessionActive ? (
                <>
                  <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg font-mono rec-anim z-10">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    REC
                  </div>

                  <div className="flex flex-col items-center gap-4 text-center px-8 py-6">
                    <div className="relative">
                      <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center"
                        style={{
                          background: 'rgba(16,185,129,0.08)',
                          border: '1px solid rgba(16,185,129,0.2)',
                        }}
                      >
                        <Camera size={30} className="text-emerald-400" />
                      </div>
                      <div className="absolute -inset-1 rounded-2xl border border-emerald-400/20 rec-anim" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 rec-anim" />
                        <p className="text-emerald-400 font-bold text-sm">
                          {isRegistrationMode
                            ? 'Kamera Aktif — Mode Registration'
                            : 'Kamera Aktif & Merekam'}
                        </p>
                      </div>

                      <p className="text-slate-400 text-xs">
                        Sesi:{' '}
                        <span className="text-slate-200 font-semibold">
                          {currentSession?.name}
                        </span>
                      </p>

                      <p className="text-slate-600 text-xs">
                        {isRegistrationMode
                          ? 'Mengumpulkan wajah untuk face enrollment, bukan attendance'
                          : 'AI mendeteksi wajah di latar belakang'}
                      </p>
                    </div>

                    <div className="flex flex-col items-center gap-2 mt-2">
                      <button
                        onClick={handleOpenCamera}
                        className="btn-camera flex items-center gap-2 text-white px-6 py-3 rounded-xl font-semibold text-sm shadow-lg"
                      >
                        <ExternalLink size={16} />
                        Buka Tampilan Kamera Penuh
                      </button>

                      <p className="text-slate-600 text-xs flex items-center gap-1">
                        <Wifi size={11} />
                        Terbuka di tab baru — deteksi tetap berjalan di sini
                      </p>
                    </div>

                    <div className="flex items-center gap-3 mt-1">
                      {cameraMiniStats.map((s) => (
                        <div
                          key={s.label}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                          style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <span className={`text-base font-extrabold ${s.color}`}>
                            {s.val}
                          </span>
                          <span className="text-slate-500 text-xs">
                            {s.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 text-center px-8">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <Camera size={26} className="text-slate-600" />
                  </div>

                  <div>
                    <p className="text-slate-500 text-sm font-semibold">
                      Kamera Tidak Aktif
                    </p>
                    <p className="text-slate-600 text-xs mt-1">
                      Klik "Mulai Sesi Absensi" untuk mengaktifkan AI dan kamera
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center justify-between flex-shrink-0">
              <div className="min-w-0 mr-4">
                <p className="text-sm font-bold text-slate-800">
                  Kontrol Sesi Absensi
                </p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {isSessionActive
                    ? isRegistrationMode
                      ? `Mode registration "${currentSession?.name}" sedang berjalan`
                      : `Sesi "${currentSession?.name}" sedang berjalan`
                    : 'Pastikan pencahayaan ruangan cukup sebelum memulai'}
                </p>
              </div>

              {!isSessionActive ? (
                <button
                  onClick={handleOpenStartModal}
                  disabled={isStarting}
                  className="btn-start flex items-center gap-2 text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow-md disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
                >
                  {isStarting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )}
                  {isStarting ? 'Memulai...' : 'Mulai Sesi Absensi'}
                </button>
              ) : (
                <button
                  onClick={handleOpenStopConfirm}
                  disabled={isStopping}
                  className="btn-end flex items-center gap-2 text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow-md disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
                >
                  {isStopping ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Square size={16} fill="currentColor" />
                  )}
                  {isStopping ? 'Menghentikan...' : 'Akhiri Sesi'}
                </button>
              )}
            </div>
          </div>

          {/* RIGHT — Log */}
          <div className="bg-white border border-slate-100 shadow-sm rounded-2xl flex flex-col overflow-hidden min-h-0">
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{
                    background: isRegistrationMode
                      ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                      : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                  }}
                >
                  <Radio size={13} className="text-white" />
                </div>

                <p className="text-sm font-bold text-slate-700">
                  Log Deteksi Live
                </p>
              </div>

              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                  isRegistrationMode ? 'text-amber-700' : 'text-indigo-700'
                }`}
                style={{
                  background: isRegistrationMode
                    ? 'rgba(245,158,11,0.12)'
                    : 'rgba(99,102,241,0.1)',
                }}
              >
                {liveLogs.length}
              </span>
            </div>

            <div className="log-scroll flex-1 overflow-y-auto p-3 space-y-2">
              {liveLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                  <Clock size={28} className="mb-2 opacity-30" />
                  <p className="text-sm font-medium">Belum ada deteksi</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {isSessionActive
                      ? 'Menunggu wajah terdeteksi kamera...'
                      : 'Mulai sesi untuk memulai perekaman'}
                  </p>
                </div>
              ) : (
                [...liveLogs].reverse().map((log, i) => {
                  const similarityValue = Number(log.similarity || 0);
                  const confPct = Math.round(similarityValue * 100);

                  const isKnown = log.status === 'KNOWN';
                  const isRegistrationLog =
                    log.status === 'REGISTRATION' || log.status === 'ENROLLING';
                  const isUpdate = log.is_update;

                  return (
                    <div
                      key={`${log.time}-${log.name}-${log.similarity}-${log.status}-${i}`}
                      className="log-item p-3 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-white hover:border-indigo-100 hover:shadow-sm transition-all flex items-start gap-3"
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {isKnown ? (
                          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                            <CheckCircle size={14} className="text-emerald-500" />
                          </div>
                        ) : isRegistrationLog ? (
                          <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                            <UserCheck size={14} className="text-amber-500" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                            <AlertCircle size={14} className="text-amber-500" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {log.name}
                          </p>

                          {isRegistrationLog && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 flex-shrink-0">
                              registration
                            </span>
                          )}

                          {isUpdate && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-500 flex-shrink-0">
                              ↑ update
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between mt-1.5">
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <Clock size={11} />
                            {log.time}
                          </span>

                          <span
                            className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded-md ${
                              confPct >= 80
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {confPct}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              <div ref={logsEndRef} />
            </div>

            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 flex-shrink-0 text-center">
              {isSessionActive ? (
                <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full rec-anim inline-block ${
                      isRegistrationMode ? 'bg-amber-400' : 'bg-emerald-400'
                    }`}
                  />
                  Polling setiap 1 detik
                </p>
              ) : (
                <p className="text-xs text-slate-400">Log sesi terakhir</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══ MODAL 1: START SESSION ══ */}
      {isStartModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="modal-enter bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="relative bg-gradient-to-br from-indigo-500 via-violet-600 to-purple-700 px-6 py-7 text-white">
              <button
                onClick={() => setIsStartModalOpen(false)}
                className="absolute top-4 right-4 p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all"
              >
                <X size={18} />
              </button>

              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-4">
                <Camera size={22} className="text-white" />
              </div>

              <h3 className="text-xl font-extrabold">Mulai Sesi Baru</h3>
              <p className="text-indigo-200 text-sm mt-1">
                Beri nama sesi ini sebelum kamera diaktifkan.
              </p>

              <div className="mt-4 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 w-fit">
                <CalendarDays size={13} className="text-indigo-200" />
                <span className="text-indigo-100 text-xs font-semibold">
                  {formatDateLong()}
                </span>
              </div>
            </div>

            <div className="px-6 py-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                  Nama Sesi <span className="text-red-400">*</span>
                </label>

                <div className="relative">
                  <Tag
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />

                  <input
                    type="text"
                    placeholder="Contoh: Ibadah Raya Sabat"
                    value={inputName}
                    onChange={(e) => {
                      setInputName(e.target.value);
                      setInputError('');
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleConfirmStart()}
                    className={`w-full pl-9 pr-4 py-3 border rounded-xl text-sm focus:ring-2 focus:outline-none bg-slate-50 focus:bg-white transition-all placeholder:text-slate-400 ${
                      inputError
                        ? 'border-red-400 bg-red-50 focus:ring-red-300'
                        : 'border-slate-200 focus:ring-indigo-400 focus:border-indigo-400'
                    }`}
                    autoFocus
                  />
                </div>

                {inputError && (
                  <p className="mt-2 text-xs text-red-500 font-medium flex items-center gap-1">
                    <AlertCircle size={12} />
                    {inputError}
                  </p>
                )}
              </div>

              <div>
                <p className="text-[11px] text-slate-400 font-bold mb-2 uppercase tracking-wide">
                  Pilihan Cepat
                </p>

                <div className="flex flex-wrap gap-2">
                  {[
                    'Ibadah Raya Sabat',
                    'Ibadah Sabtu Sore',
                    'Ibadah Pemuda',
                    'Ibadah Doa Malam',
                    'Ibadah Anak-anak',
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setInputName(s);
                        setInputError('');
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button
                onClick={() => setIsStartModalOpen(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-all border border-slate-200 bg-white"
              >
                Batal
              </button>

              <button
                onClick={handleConfirmStart}
                disabled={isStarting}
                className="btn-start flex-1 flex items-center justify-center gap-2 text-white py-2.5 rounded-xl font-semibold text-sm shadow-md disabled:opacity-60"
              >
                {isStarting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Play size={15} fill="currentColor" />
                )}
                {isStarting ? 'Memulai...' : 'Mulai Sesi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL 2: STOP CONFIRM ══ */}
      {isStopConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="modal-enter bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 pt-8 pb-5 text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'linear-gradient(135deg,#fef3c7,#fde68a)' }}
              >
                <AlertCircle size={24} className="text-amber-600" />
              </div>

              <h3 className="text-lg font-extrabold text-slate-800">
                Akhiri Sesi?
              </h3>

              <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                Kamera akan dimatikan dan sesi{' '}
                <span className="font-bold text-slate-700">
                  "{currentSession?.name}"
                </span>{' '}
                akan ditutup.
              </p>

              <p className="text-slate-400 text-xs mt-2">
                {isRegistrationMode
                  ? 'Data wajah yang sudah tersimpan dapat divalidasi di halaman Validasi AI.'
                  : 'Data absensi yang sudah terekam tetap tersimpan di database.'}
              </p>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setIsStopConfirmOpen(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all border border-slate-200 bg-white"
              >
                Kembali
              </button>

              <button
                onClick={handleConfirmStop}
                className="btn-end flex-1 flex items-center justify-center gap-2 text-white py-2.5 rounded-xl font-semibold text-sm shadow-md"
              >
                <Square size={14} fill="currentColor" />
                Ya, Akhiri Sesi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ OVERLAY: Stopping ══ */}
      {isStopping && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-9 flex flex-col items-center gap-4 text-center max-w-xs w-full mx-4">
            <Loader2 size={38} className="text-indigo-500 animate-spin" />
            <div>
              <p className="font-bold text-slate-800 text-base">
                Menghentikan Sesi...
              </p>
              <p className="text-slate-500 text-sm mt-1">
                Menunggu data tersimpan
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL 3: STOP RESULT ══ */}
      {isStopResultOpen && stoppedSessionData && (
        <StopResultModal
          data={stoppedSessionData}
          onClose={() => {
            setIsStopResultOpen(false);
            setStoppedSessionData(null);
          }}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
//  SUB-COMPONENT: Stop Result Modal
// ═══════════════════════════════════════════════════════════════
function StopResultModal({ data, onClose }) {
  const { mode, sessionName, startTime, endTime, apiResult, stats } = data;

  const isRegistrationMode = mode === 'registration';

  if (isRegistrationMode) {
    const detected = stats?.detected ?? 0;
    const stored = stats?.stored ?? 0;
    const skipped = stats?.skipped_same_track ?? 0;

    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="modal-enter bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
          <div className="relative bg-gradient-to-br from-amber-500 to-orange-600 px-6 py-7 text-white flex-shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-4">
              <CheckCircle size={22} className="text-white" />
            </div>

            <h3 className="text-xl font-extrabold">
              Registration Berhasil Diakhiri
            </h3>

            <p className="text-amber-100 text-sm mt-1">
              Data wajah tersimpan sebagai staging dan perlu divalidasi ke jemaat.
            </p>

            <div className="mt-4 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 w-fit">
              <Tag size={13} className="text-amber-100" />
              <span className="text-white text-xs font-bold">
                {sessionName || 'Face Registration'}
              </span>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                  Mulai
                </p>
                <p className="text-sm font-bold text-slate-700 font-mono">
                  {formatTimeShort(startTime)}
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                  Selesai
                </p>
                <p className="text-sm font-bold text-slate-700 font-mono">
                  {formatTimeShort(endTime)}
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                  Durasi
                </p>
                <div className="flex items-center gap-1">
                  <Timer size={12} className="text-amber-400 flex-shrink-0" />
                  <p className="text-sm font-bold text-slate-700">
                    {getDuration(startTime, endTime)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl p-4 text-white bg-indigo-600">
                <p className="text-indigo-100 text-[11px] font-bold uppercase tracking-wide">
                  Detected
                </p>
                <p className="mt-1 text-3xl font-extrabold">{detected}</p>
                <p className="text-indigo-100 text-xs mt-1">Wajah terbaca</p>
              </div>

              <div className="rounded-2xl p-4 text-white bg-emerald-600">
                <p className="text-emerald-100 text-[11px] font-bold uppercase tracking-wide">
                  Stored
                </p>
                <p className="mt-1 text-3xl font-extrabold">{stored}</p>
                <p className="text-emerald-100 text-xs mt-1">Masuk staging</p>
              </div>

              <div className="rounded-2xl p-4 text-white bg-amber-600">
                <p className="text-amber-100 text-[11px] font-bold uppercase tracking-wide">
                  Skipped
                </p>
                <p className="mt-1 text-3xl font-extrabold">{skipped}</p>
                <p className="text-amber-100 text-xs mt-1">Track sama</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <ShieldAlert size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-700">
                  Lanjutkan ke Validasi AI
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Buka halaman Validasi AI, lalu pilih gambar registration untuk
                  dikaitkan ke jemaat lama atau dibuat sebagai jemaat baru.
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex-shrink-0">
            <button
              onClick={onClose}
              className="btn-success w-full py-3 text-sm font-bold text-white rounded-xl transition-all shadow-md"
            >
              Selesai
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sessionNameDisplay =
    apiResult?.session_name || sessionName || 'Sesi Selesai';
  const startTimeDisplay = apiResult?.start_time || startTime;
  const endTimeDisplay = apiResult?.end_time || endTime || null;
  const totalActive = apiResult?.total_active_members ?? '—';
  const totalDetected = apiResult?.total_detected ?? '—';
  const presentCount = apiResult?.present_count ?? '—';
  const needValidationCount = apiResult?.need_validation_count ?? '—';
  const hasData = !!apiResult;

  const attendanceRate =
    hasData &&
    typeof presentCount === 'number' &&
    typeof totalActive === 'number' &&
    totalActive > 0
      ? Math.round((presentCount / totalActive) * 100)
      : null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="modal-enter bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-emerald-500 to-teal-600 px-6 py-7 text-white flex-shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-4">
            <CheckCircle size={22} className="text-white" />
          </div>

          <h3 className="text-xl font-extrabold">Sesi Berhasil Diakhiri</h3>

          <p className="text-emerald-200 text-sm mt-1">
            {hasData
              ? 'Laporan absensi berhasil diambil dari database.'
              : 'Data tersimpan. Laporan tidak tersedia saat ini.'}
          </p>

          <div className="mt-4 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 w-fit">
            <Tag size={13} className="text-emerald-200" />
            <span className="text-white text-xs font-bold">
              {sessionNameDisplay}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Waktu */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                Mulai
              </p>
              <p className="text-sm font-bold text-slate-700 font-mono">
                {formatTimeShort(startTimeDisplay)}
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                Selesai
              </p>
              <p className="text-sm font-bold text-slate-700 font-mono">
                {formatTimeShort(endTimeDisplay)}
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                Durasi
              </p>
              <div className="flex items-center gap-1">
                <Timer size={12} className="text-indigo-400 flex-shrink-0" />
                <p className="text-sm font-bold text-slate-700">
                  {getDuration(startTimeDisplay, endTimeDisplay)}
                </p>
              </div>
            </div>
          </div>

          {/* Stat cards utama */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="rounded-2xl p-4 text-white"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Users size={14} className="text-indigo-200" />
                <p className="text-indigo-200 text-[11px] font-bold uppercase tracking-wide">
                  Member Aktif
                </p>
              </div>
              <p className="text-3xl font-extrabold">{totalActive}</p>
              <p className="text-indigo-200 text-xs mt-1">Terdaftar di sistem</p>
            </div>

            <div
              className="rounded-2xl p-4 text-white"
              style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <UserCheck size={14} className="text-emerald-200" />
                <p className="text-emerald-200 text-[11px] font-bold uppercase tracking-wide">
                  Hadir
                </p>
              </div>
              <p className="text-3xl font-extrabold">{presentCount}</p>
              <p className="text-emerald-200 text-xs mt-1">
                {attendanceRate !== null
                  ? `${attendanceRate}% dari member aktif`
                  : 'Berhasil dikenali AI'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Eye size={14} className="text-blue-400" />
                <p className="text-[11px] font-bold text-blue-500 uppercase tracking-wide">
                  Terdeteksi
                </p>
              </div>
              <p className="text-2xl font-extrabold text-blue-700">
                {totalDetected}
              </p>
              <p className="text-blue-400 text-xs mt-0.5">
                Known + Unknown + Ambigu
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert size={14} className="text-amber-500" />
                <p className="text-[11px] font-bold text-amber-500 uppercase tracking-wide">
                  Perlu Validasi
                </p>
              </div>
              <p className="text-2xl font-extrabold text-amber-700">
                {needValidationCount}
              </p>
              <p className="text-amber-400 text-xs mt-0.5">Unknown & Ambigu</p>
            </div>
          </div>

          {attendanceRate !== null && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-600">
                  Tingkat Kehadiran
                </p>
                <span className="text-xs font-extrabold text-emerald-600">
                  {attendanceRate}%
                </span>
              </div>

              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-2.5 rounded-full transition-all duration-700"
                  style={{
                    width: `${attendanceRate}%`,
                    background:
                      attendanceRate >= 70
                        ? 'linear-gradient(90deg,#10b981,#059669)'
                        : attendanceRate >= 40
                        ? 'linear-gradient(90deg,#f59e0b,#d97706)'
                        : 'linear-gradient(90deg,#f43f5e,#e11d48)',
                  }}
                />
              </div>

              <p className="text-xs text-slate-400 mt-2 text-center">
                {presentCount} dari {totalActive} member hadir dalam sesi ini
              </p>
            </div>
          )}

          {!hasData && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle
                size={16}
                className="text-amber-500 flex-shrink-0 mt-0.5"
              />
              <div>
                <p className="text-xs font-bold text-amber-700">
                  Laporan tidak tersedia
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Sesi berhasil ditutup. Lihat detail absensi di halaman{' '}
                  <span className="font-semibold">Laporan Kehadiran</span>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex-shrink-0">
          <button
            onClick={onClose}
            className="btn-success w-full py-3 text-sm font-bold text-white rounded-xl transition-all shadow-md"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}