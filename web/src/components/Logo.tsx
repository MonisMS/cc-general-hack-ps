export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="23" height="23" rx="6" fill="#f7f8f8" />
      <path d="M7 7h5.2a5 5 0 0 1 0 10H7z" stroke="#08090a" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="11.6" cy="12" r="1.6" fill="#08090a" />
    </svg>
  );
}
