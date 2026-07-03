// ============================================================
//  Dashboard.jsx
//  Native analytics dashboard with member attendance percentage.
// ============================================================

import { createElement, useEffect, useMemo, useState } from 'react';
import { getAllMembers, getSessions } from '../service/apiClient';

import {
  Activity,
  BarChart3,
  CalendarDays,
  Percent,
  TrendingUp,
  Users,
} from 'lucide-react';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const getMemberAttendanceRate = (memberCount = 0, absentCount = 0) => {
  const totalMembers = memberCount + absentCount;
  if (totalMembers <= 0) return 0;
  return Math.round((memberCount / totalMembers) * 100);
};

const formatPercent = (value) => `${Math.round(value)}%`;

export default function Dashboard() {
  const [dashboardData, setDashboardData] = useState({
    totalMembers: '...',
    monthSessions: '...',
    avgAttendance: '...',
    status: 'loading',
    sessions: [],
  });

  useEffect(() => {
    Promise.all([
      getAllMembers(),
      getSessions(CURRENT_YEAR),
    ])
      .then(([members, sessions]) => {
        const monthSessions = sessions.filter((s) => {
          if (!s.date) return false;
          const d = new Date(s.date);
          return d.getFullYear() === CURRENT_YEAR && d.getMonth() === CURRENT_MONTH;
        }).length;

        const presentTotal = sessions.reduce((sum, s) => sum + (s.member_count ?? 0), 0);
        const absentTotal = sessions.reduce((sum, s) => sum + (s.absent_count ?? 0), 0);

        setDashboardData({
          totalMembers: String(members.length),
          monthSessions: String(monthSessions),
          avgAttendance: formatPercent(getMemberAttendanceRate(presentTotal, absentTotal)),
          status: 'live',
          sessions,
        });
      })
      .catch(() => {
        setDashboardData({
          totalMembers: '—',
          monthSessions: '—',
          avgAttendance: '—',
          status: 'error',
          sessions: [],
        });
      });
  }, []);

  const chartData = useMemo(() => {
    const byMonth = MONTHS.map((month) => ({
      month,
      present: 0,
      absent: 0,
      rate: 0,
    }));

    dashboardData.sessions.forEach((session) => {
      if (!session.date) return;
      const monthIndex = new Date(session.date).getMonth();
      if (monthIndex < 0 || monthIndex >= byMonth.length) return;

      byMonth[monthIndex].present += session.member_count ?? 0;
      byMonth[monthIndex].absent += session.absent_count ?? 0;
    });

    return byMonth.map((item) => ({
      ...item,
      rate: getMemberAttendanceRate(item.present, item.absent),
    }));
  }, [dashboardData.sessions]);

  const bestMonth = chartData.reduce(
    (best, item) => (item.rate > best.rate ? item : best),
    { month: '—', rate: 0 }
  );

  const latestMonth = chartData[CURRENT_MONTH] ?? { month: '—', rate: 0 };

  const stats = [
    {
      label: 'Total Jemaat',
      value: dashboardData.totalMembers,
      icon: Users,
      color: 'from-indigo-500 to-violet-600',
      shadow: 'shadow-indigo-200',
    },
    {
      label: 'Sesi Bulan Ini',
      value: dashboardData.monthSessions,
      icon: CalendarDays,
      color: 'from-emerald-500 to-teal-500',
      shadow: 'shadow-emerald-200',
    },
    {
      label: 'Kehadiran Jemaat',
      value: dashboardData.avgAttendance,
      icon: TrendingUp,
      color: 'from-amber-500 to-orange-500',
      shadow: 'shadow-amber-200',
    },
    {
      label: 'Status Sistem',
      value: dashboardData.status === 'live' ? 'Live' : dashboardData.status === 'error' ? 'Error' : '...',
      icon: Activity,
      color: dashboardData.status === 'error'
        ? 'from-red-500 to-rose-600'
        : 'from-rose-500 to-pink-600',
      shadow: dashboardData.status === 'error' ? 'shadow-red-200' : 'shadow-rose-200',
    },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        .dash-root { font-family: 'Plus Jakarta Sans', sans-serif; }
        .stat-card { animation: statFadeUp 0.5s ease both; }
        .stat-card:nth-child(1) { animation-delay: 0.05s; }
        .stat-card:nth-child(2) { animation-delay: 0.10s; }
        .stat-card:nth-child(3) { animation-delay: 0.15s; }
        .stat-card:nth-child(4) { animation-delay: 0.20s; }
        @keyframes statFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .chart-panel { animation: chartFadeIn 0.6s ease 0.18s both; }
        @keyframes chartFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

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
      `}</style>

      <div className="flex flex-col gap-5 h-[calc(100vh-8rem)] dash-root">
        <div className="flex sm:flex-row flex-col sm:justify-between sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="flex flex-shrink-0 justify-center items-center bg-gradient-to-br from-indigo-500 to-violet-600 shadow-indigo-200 shadow-lg rounded-2xl w-12 h-12">
              <BarChart3 size={22} className="text-white" />
            </div>
            <div>
              <h2 className="font-extrabold text-slate-800 text-2xl leading-none tracking-tight">
                Dashboard Analitik
              </h2>
              <p className="mt-1 text-slate-500 text-sm">
                Ringkasan data jemaat dan persentase kehadiran
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white shadow-sm px-4 py-2.5 border border-slate-200 rounded-2xl">
            <div
              className="live-dot"
              style={dashboardData.status === 'error' ? { background: '#ef4444', boxShadow: 'none' } : {}}
            />
            <span className="font-bold text-slate-600 text-sm">
              {dashboardData.status === 'error' ? 'Data gagal dimuat' : `Tahun ${CURRENT_YEAR}`}
            </span>
          </div>
        </div>

        <div className="flex-shrink-0 gap-3 grid grid-cols-2 sm:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, color, shadow }) => (
            <div
              key={label}
              className={`stat-card rounded-2xl bg-gradient-to-br ${color} p-4 text-white shadow-lg ${shadow}`}
            >
              <div className="flex justify-between items-center mb-3">
                <p className="font-semibold text-white/80 text-xs uppercase leading-tight tracking-wide">
                  {label}
                </p>
                <div className="flex justify-center items-center bg-white/20 rounded-lg w-7 h-7">
                  {createElement(Icon, { size: 13, className: 'text-white' })}
                </div>
              </div>
              <p className="font-extrabold text-2xl">{value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col flex-1 bg-white shadow-sm border border-slate-200 rounded-2xl min-h-0 overflow-hidden chart-panel">
          <div className="flex lg:flex-row flex-col flex-shrink-0 lg:justify-between lg:items-center gap-4 px-5 py-4 border-slate-100 border-b">
            <div className="flex items-center gap-3">
              <div className="flex justify-center items-center bg-indigo-50 rounded-xl w-10 h-10 text-indigo-600">
                <Percent size={18} />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-base">Persentase Kehadiran Jemaat</h3>
                <p className="font-medium text-slate-400 text-xs">
                  {CURRENT_YEAR} · berdasarkan jemaat hadir dan absen
                </p>
              </div>
            </div>

            <div className="sm:flex gap-2 grid grid-cols-2">
              <MetricPill label="Bulan ini" value={formatPercent(latestMonth.rate)} />
              <MetricPill label="Tertinggi" value={`${bestMonth.month} ${formatPercent(bestMonth.rate)}`} />
            </div>
          </div>

          <div className="flex-1 px-4 py-5 min-h-0">
            <AttendanceChart data={chartData} />
          </div>
        </div>
      </div>
    </>
  );
}

function MetricPill({ label, value }) {
  return (
    <div className="bg-slate-50 px-4 py-2 rounded-xl">
      <p className="font-bold text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="font-extrabold text-slate-700 text-sm">{value}</p>
    </div>
  );
}

function AttendanceChart({ data }) {
  const chartHeight = 250;
  const barWidth = 42;
  const gap = 20;
  const leftGutter = 44;
  const rightGutter = 12;
  const chartWidth = leftGutter + data.length * (barWidth + gap) + rightGutter;
  const axisTop = 16;
  const axisBottom = 214;
  const plotHeight = axisBottom - axisTop;

  return (
    <div className="h-full min-h-[320px] overflow-x-auto">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="min-w-[820px] h-full text-slate-500"
        role="img"
        aria-label="Grafik persentase kehadiran jemaat bulanan"
      >
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = axisBottom - (tick / 100) * plotHeight;
          return (
            <g key={tick}>
              <line x1="0" x2={chartWidth} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 5" />
              <text x="4" y={y - 5} className="fill-slate-400 font-bold text-[10px]">
                {tick}%
              </text>
            </g>
          );
        })}

        {data.map((item, index) => {
          const x = leftGutter + gap + index * (barWidth + gap);
          const barHeight = Math.max(4, (item.rate / 100) * plotHeight);
          const y = axisBottom - barHeight;
          const isCurrentMonth = index === CURRENT_MONTH;

          return (
            <g key={item.month}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx="8"
                className={isCurrentMonth ? 'fill-indigo-600' : 'fill-slate-300'}
              />
              <text
                x={x + barWidth / 2}
                y={Math.max(axisTop + 10, y - 8)}
                textAnchor="middle"
                className={`text-[11px] font-extrabold ${isCurrentMonth ? 'fill-indigo-700' : 'fill-slate-500'}`}
              >
                {item.rate}%
              </text>
              <text
                x={x + barWidth / 2}
                y={236}
                textAnchor="middle"
                className="fill-slate-500 font-bold text-[11px]"
              >
                {item.month}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
