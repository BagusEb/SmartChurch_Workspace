import { Loader2, Database, BarChart2, Table, FileText, Eraser } from 'lucide-react';

export const TOOL_META = {
  query_postgres: { label: 'Querying database', icon: Database },
  generate_seaborn_plot: { label: 'Generating chart', icon: BarChart2 },
  get_schema: { label: 'Reading schema', icon: Table },
  update_canvas: { label: 'Updating canvas', icon: FileText },
  clear_canvas: { label: 'Clearing canvas', icon: Eraser },
};

export default function ToolCallPill({ toolName, loading = false }) {
  const meta = TOOL_META[toolName] || { label: toolName, icon: Loader2 };
  const Icon = loading ? Loader2 : meta.icon;
  return (
    <div className="inline-flex items-center gap-1.5 bg-indigo-50 px-2.5 py-1 border border-indigo-200 rounded-full font-medium text-indigo-700 text-xs">
      <Icon size={11} className={loading ? 'animate-spin' : ''} />
      {meta.label}
    </div>
  );
}
