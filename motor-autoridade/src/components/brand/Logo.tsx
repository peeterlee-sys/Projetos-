import { brand } from "@/lib/brand";

/**
 * Identidade visual do deploy. `BrandMark` é o ícone (quadrado verde, play
 * creme, ponto dourado); `BrandLogo` combina o ícone com o logotipo da marca
 * ativa — "Take." ou "Assessor 24h", conforme NEXT_PUBLIC_BRAND.
 */

export function BrandMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label={brand.name}
      className={className}
    >
      <defs>
        <linearGradient id="take-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#245c44" />
          <stop offset="1" stopColor="#143627" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="118" fill="url(#take-bg)" />
      <polygon points="180,166 180,402 412,284" fill="#0f2a1f" opacity="0.45" />
      <polygon points="168,150 168,388 398,269" fill="#f5f0e6" />
      <circle cx="360" cy="378" r="44" fill="#0f2a1f" opacity="0.35" />
      <circle cx="356" cy="372" r="44" fill="#c9a94e" />
    </svg>
  );
}

export function BrandLogo({
  size = 40,
  className = "",
  wordClassName = "",
}: {
  size?: number;
  className?: string;
  wordClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark size={size} />
      <span
        className={`font-serif font-semibold leading-none tracking-tight text-brand-700 ${wordClassName}`}
        style={{ fontSize: size * brand.wordmarkScale }}
      >
        {brand.wordmark.lead}
        <span className="text-gold-500">{brand.wordmark.accent}</span>
      </span>
    </span>
  );
}
