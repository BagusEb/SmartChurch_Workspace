export default function StatCard({ label, value, icon: Icon, gradient, shadow, labelColor, subLabel, isLoading }) {
  return (
    <div className={`${gradient} ${shadow} shadow-lg p-5 rounded-2xl text-white`}>
      <div className="flex justify-between items-center mb-3">
        <p className={`font-semibold ${labelColor} text-xs uppercase tracking-wide`}>{label}</p>
        <div className="flex justify-center items-center bg-white/20 rounded-lg w-8 h-8">
          <Icon size={15} className="text-white" />
        </div>
      </div>
      <p className="font-extrabold text-3xl">{isLoading ? '—' : value}</p>
      <p className={`mt-1.5 ${labelColor} text-xs`}>{subLabel}</p>
    </div>
  );
}
