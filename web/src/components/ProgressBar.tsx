export function ProgressBar({ value, running = true }: { value: number; running?: boolean }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/5">
      <div
        className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-violet-500 to-indigo-400 transition-[width] duration-700 ease-out"
        style={{ width: `${Math.max(v, 3)}%` }}
      >
        {running && <div className="animate-shimmer absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent" />}
      </div>
    </div>
  );
}
