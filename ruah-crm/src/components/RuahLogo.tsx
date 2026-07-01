export function RuahLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 44 34" className="h-8 w-11 flex-shrink-0" fill="none" aria-hidden="true">
        <path d="M8,7 C14,1 20,1 26,7 C32,13 38,13 44,7" stroke="#C9A24C" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M4,17 C10,11 16,11 22,17 C28,23 34,23 40,17" stroke="#C9A24C" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M0,27 C6,21 12,21 18,27 C24,33 30,33 36,27" stroke="#C9A24C" strokeWidth="4.5" strokeLinecap="round" />
      </svg>
      <span className="text-2xl font-bold tracking-wide text-[#16233F]">RUAH</span>
    </div>
  );
}
