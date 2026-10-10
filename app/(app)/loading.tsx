export default function Loading() {
  return (
    <div className="max-w-5xl animate-pulse space-y-5" role="status" aria-label="Memuat">
      <div className="h-4 w-24 rounded bg-slate-200" /><div className="h-9 w-72 rounded-lg bg-slate-200" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-slate-200" />)}</div>
      <div className="h-64 rounded-2xl bg-slate-200" />
    </div>
  );
}
