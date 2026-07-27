import { brand } from "@/lib/brand";

/**
 * Identidade visual do deploy. `BrandMark` é o ícone (quadrado verde, play
 * creme, ponto dourado); `BrandLogo` combina o ícone com o logotipo da marca
 * ativa — "Take." ou "Assessor 24h", conforme NEXT_PUBLIC_BRAND.
 */

export function BrandMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  // Assessor 24h: balão de conversa com relógio — o mesmo símbolo do site.
  if (brand.id === "assessor24h") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        role="img"
        aria-label={brand.name}
        className={className}
      >
        <path
          d="M24 4C12.6 4 4 12.1 4 22.3c0 5.4 2.4 10.3 6.4 13.7c.5.5.8 1.2.6 1.9l-1.6 6c-.3 1.2.8 2.2 2 1.8l7.2-2.6c.5-.2 1-.2 1.5 0c1.3.3 2.6.4 3.9.4c11.4 0 20-8.1 20-18.3S35.4 4 24 4z"
          fill="#246BFD"
        />
        <circle cx="24" cy="22.5" r="10" stroke="#FFFFFF" strokeWidth="2.6" fill="none" />
        <path
          d="M24 16.5v6l4.6 2.8"
          stroke="#34C17D"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    );
  }

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
