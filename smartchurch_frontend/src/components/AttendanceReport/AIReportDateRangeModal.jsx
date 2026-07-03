import { Bot } from 'lucide-react';
import DateRangeActionModal from './DateRangeActionModal';

export default function AIReportDateRangeModal({
  show,
  startDate,
  endDate,
  isGenerating,
  generateError,
  onClose,
  onGenerate,
  setStartDate,
  setEndDate,
}) {
  return (
    <DateRangeActionModal
      show={show}
      title="Buat Laporan AI"
      subtitle="AI akan menganalisis rentang waktu yang dipilih"
      Icon={Bot}
      iconGradient="bg-linear-to-br from-indigo-500 to-purple-500"
      infoText="AI akan menganalisis data kehadiran pada rentang tanggal yang dipilih dan menghasilkan laporan lengkap. Proses ini membutuhkan waktu 20-60 detik."
      infoBgClass="bg-indigo-50"
      infoTextClass="text-indigo-600"
      infoIconClass="text-indigo-500"
      primaryLabel="Generate"
      loadingLabel="Membuat Laporan..."
      PrimaryIcon={Bot}
      primaryButtonClass="bg-linear-to-br from-indigo-500 to-purple-500 hover:opacity-90"
      startDate={startDate}
      endDate={endDate}
      isLoading={isGenerating}
      error={generateError}
      onClose={onClose}
      onSubmit={onGenerate}
      setStartDate={setStartDate}
      setEndDate={setEndDate}
    />
  );
}
