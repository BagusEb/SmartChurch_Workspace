import { useCallback, useEffect, useState } from 'react';
import {
  getYearlyAttendanceReport,
  getSummaryReports,
  generateYearlyReport,
  getReportDetail,
  getFollowUpRecommendations,
  getGuestConversionRecommendations,
  getSessions,
  getSessionAttendees,
} from '../service/apiClient';
import { FileText, Download, Filter, Users, TrendingUp, CheckCircle } from 'lucide-react';
import StatCard from '../components/AttendanceReport/StatCard';
import AIReportsSection from '../components/AttendanceReport/AIReportsSection';
import GenerateModal from '../components/AttendanceReport/GenerateModal';
import ViewReportModal from '../components/AttendanceReport/ViewReportModal';
import RecommendationsSection from '../components/AttendanceReport/RecommendationsSection';
import SessionsListSection from '../components/AttendanceReport/SessionsListSection';
import RecommendationDetailModal from '../components/AttendanceReport/RecommendationDetailModal';
import SessionAttendeesModal from '../components/AttendanceReport/SessionAttendeesModal';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const inputCls = 'bg-slate-50 border border-slate-200 rounded-xl text-sm transition-all focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100';

export default function AttendanceReport() {

  const [selectedYear, setSelectedYear] = useState(String(CURRENT_YEAR));
  const [summary, setSummary] = useState({
    total_hadir_orang_tahun_ini: 0,
    rata_rata_orang_per_ibadah: 0,
    tamu_baru_count: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const [savedReports, setSavedReports] = useState([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportSummaryContent, setReportSummaryContent] = useState(null);
  const [isLoadingReportSummary, setIsLoadingReportSummary] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateStartDate, setGenerateStartDate] = useState('');
  const [generateEndDate, setGenerateEndDate] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  // Recommendations
  const [followUps, setFollowUps] = useState([]);
  const [guestConversions, setGuestConversions] = useState([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState(true);
  const [selectedRec, setSelectedRec] = useState(null); // { type: 'followup'|'guest', data }

  // Sessions
  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionAttendees, setSessionAttendees] = useState(null);
  const [isLoadingAttendees, setIsLoadingAttendees] = useState(false);

  useEffect(() => {
    const fetchOverview = async () => {
      setIsLoading(true);
      try {
        const data = await getYearlyAttendanceReport(selectedYear);
        setSummary({
          total_hadir_orang_tahun_ini: data.total_hadir_orang_tahun_ini ?? 0,
          rata_rata_orang_per_ibadah: data.rata_rata_orang_per_ibadah ?? 0,
          tamu_baru_count: data.tamu_baru_count ?? 0,
        });
      } catch (error) {
        console.error('Failed to fetch attendance overview:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchOverview();
  }, [selectedYear]);

  useEffect(() => {
    const fetchSessions = async () => {
      setIsLoadingSessions(true);
      try {
        const data = await getSessions(selectedYear);
        setSessions(data);
      } catch (e) {
        console.error('Failed to fetch sessions:', e);
      } finally {
        setIsLoadingSessions(false);
      }
    };
    fetchSessions();
  }, [selectedYear]);

  const fetchSavedReports = useCallback(async () => {
    try {
      setIsLoadingReports(true);
      const data = await getSummaryReports();
      setSavedReports(
        [...data].sort((a, b) => new Date(b.report_start_date) - new Date(a.report_start_date))
      );
    } catch (e) {
      console.error('Failed to fetch saved reports:', e);
    } finally {
      setIsLoadingReports(false);
    }
  }, []);

  const fetchRecommendations = useCallback(async () => {
    setIsLoadingRecs(true);
    try {
      const [fu, gc] = await Promise.all([
        getFollowUpRecommendations(),
        getGuestConversionRecommendations(),
      ]);
      setFollowUps(fu);
      setGuestConversions(gc);
    } catch (e) {
      console.error('Failed to fetch recommendations:', e);
    } finally {
      setIsLoadingRecs(false);
    }
  }, []);

  useEffect(() => { fetchSavedReports(); }, [fetchSavedReports]);
  useEffect(() => { fetchRecommendations(); }, [fetchRecommendations]);

  const openReport = async (report) => {
    setSelectedReport(report);
    setReportSummaryContent(null);
    setIsLoadingReportSummary(true);
    try {
      const detail = await getReportDetail(report.id);
      setReportSummaryContent(detail.report_summary ?? '');
    } catch {
      setReportSummaryContent('Gagal memuat isi laporan.');
    } finally {
      setIsLoadingReportSummary(false);
    }
  };

  const handleGenerate = async () => {
    if (!generateStartDate || !generateEndDate) return;
    try {
      setIsGenerating(true);
      setGenerateError('');
      await generateYearlyReport(generateStartDate, generateEndDate);
      await fetchSavedReports();
      setShowGenerateModal(false);
      setGenerateStartDate('');
      setGenerateEndDate('');
    } catch (e) {
      setGenerateError('Gagal membuat laporan. Coba lagi.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSessionClick = async (session) => {
    setSelectedSession(session);
    setSessionAttendees(null);
    setIsLoadingAttendees(true);
    try {
      const data = await getSessionAttendees(session.date);
      setSessionAttendees(data);
    } catch {
      setSessionAttendees({ members: [], guests: [] });
    } finally {
      setIsLoadingAttendees(false);
    }
  };


  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  };

  return (
    <>
      <div className="flex flex-col gap-5 font-plus-jakarta">

        <div className="flex sm:flex-row flex-col sm:justify-between sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="flex justify-center items-center bg-linear-to-br from-indigo-500 to-purple-500 shadow-indigo-200 shadow-lg rounded-2xl w-12 h-12 shrink-0">
              <FileText size={22} className="text-white" />
            </div>
            <div>
              <h2 className="font-extrabold text-slate-800 text-2xl tracking-tight">Laporan Kehadiran</h2>
              <p className="mt-0.5 text-slate-500 text-sm">Pantau tren partisipasi jemaat dan riwayat absensi tahunan</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <span className="font-semibold text-slate-500 text-sm">Tahun:</span>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
            className={`${inputCls} px-3 py-2`}
          >
            {YEAR_OPTIONS.map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>

        <div className="gap-4 grid grid-cols-1 md:grid-cols-3">
          <StatCard
            label="Total Hadir"
            value={summary.total_hadir_orang_tahun_ini}
            icon={Users}
            gradient="bg-linear-to-br from-indigo-500 to-purple-500"
            shadow="shadow-indigo-200"
            labelColor="text-indigo-200"
            subLabel={`Orang tahun ${selectedYear}`}
            isLoading={isLoading}
          />
          <StatCard
            label="Rata-rata"
            value={summary.rata_rata_orang_per_ibadah}
            icon={TrendingUp}
            gradient="bg-linear-to-br from-emerald-500 to-emerald-600"
            shadow="shadow-emerald-200"
            labelColor="text-emerald-200"
            subLabel="Orang per ibadah"
            isLoading={isLoading}
          />
          <StatCard
            label="Tamu Baru"
            value={summary.tamu_baru_count}
            icon={CheckCircle}
            gradient="bg-linear-to-br from-amber-400 to-amber-600"
            shadow="shadow-amber-200"
            labelColor="text-amber-200"
            subLabel="Orang terdaftar"
            isLoading={isLoading}
          />
        </div>

        <RecommendationsSection
          followUps={followUps}
          guestConversions={guestConversions}
          isLoading={isLoadingRecs}
          onSelectFollowUp={(item) => setSelectedRec({ type: 'followup', data: item })}
          onSelectGuest={(item) => setSelectedRec({ type: 'guest', data: item })}
        />

        <SessionsListSection
          sessions={sessions}
          isLoading={isLoadingSessions}
          onSessionClick={handleSessionClick}
        />

        <AIReportsSection
          savedReports={savedReports}
          isLoadingReports={isLoadingReports}
          openReport={openReport}
          onCreateClick={() => { setShowGenerateModal(true); setGenerateError(''); }}
          formatDate={formatDate}
        />

      </div>

      <GenerateModal
        show={showGenerateModal}
        startDate={generateStartDate}
        endDate={generateEndDate}
        isGenerating={isGenerating}
        generateError={generateError}
        onClose={() => setShowGenerateModal(false)}
        onGenerate={handleGenerate}
        setStartDate={setGenerateStartDate}
        setEndDate={setGenerateEndDate}
      />

      <ViewReportModal
        report={selectedReport}
        isLoading={isLoadingReportSummary}
        content={reportSummaryContent}
        onClose={() => setSelectedReport(null)}
        formatDate={formatDate}
      />

      {selectedRec && (
        <RecommendationDetailModal
          type={selectedRec.type}
          data={selectedRec.data}
          onClose={() => setSelectedRec(null)}
          onUpdated={fetchRecommendations}
        />
      )}

      {selectedSession && (
        <SessionAttendeesModal
          session={selectedSession}
          attendees={sessionAttendees}
          isLoading={isLoadingAttendees}
          onClose={() => { setSelectedSession(null); setSessionAttendees(null); }}
        />
      )}
    </>
  );
}
