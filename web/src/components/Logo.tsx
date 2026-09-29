import { Compass } from "lucide-react";

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div
      className="grid place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20 ring-1 ring-white/10"
      style={{ width: size, height: size }}
    >
      <Compass className="text-white" style={{ width: size * 0.56, height: size * 0.56 }} />
    </div>
  );
}
