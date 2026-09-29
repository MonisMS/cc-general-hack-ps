export function ProgressBar({ value }: { value: number; running?: boolean }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className="h-full rounded-full bg-violet-500 transition-[width] duration-700 ease-out"
        style={{ width: `${Math.max(v, 3)}%` }}
      />
    </div>
  );
}
