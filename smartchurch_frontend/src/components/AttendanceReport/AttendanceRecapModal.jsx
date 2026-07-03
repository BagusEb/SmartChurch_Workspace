import { Download, FileSpreadsheet } from 'lucide-react';
import DateRangeActionModal from './DateRangeActionModal';

export default function AttendanceRecapModal({
  show,
  startDate,
  endDate,
  isDownloading,
  error,
  onClose,
  onDownload,
  setStartDate,
  setEndDate,
}) {
  return (
    <DateRangeActionModal
      show={show}
      title="Rekap Absen"
      subtitle="Download laporan absensi dalam format XLSX"
      Icon={FileSpreadsheet}
      iconGradient="bg-linear-to-br from-indigo-500 to-purple-500"
      infoText="File berisi Summary, daftar member yang perlu follow-up, dan sheet per sesi ibadah pada rentang tanggal yang dipilih."
      infoBgClass="bg-indigo-50"
      infoTextClass="text-indigo-600"
      infoIconClass="text-indigo-500"
      primaryLabel="Download"
      loadingLabel="Menyiapkan XLSX..."
      PrimaryIcon={Download}
      primaryButtonClass="bg-linear-to-br from-indigo-500 to-purple-500 hover:opacity-90"
      startDate={startDate}
      endDate={endDate}
      isLoading={isDownloading}
      error={error}
      onClose={onClose}
      onSubmit={onDownload}
      setStartDate={setStartDate}
      setEndDate={setEndDate}
    />
  );
}
