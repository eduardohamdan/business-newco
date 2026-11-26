import { BRAND } from "@/lib/brand";

/**
 * Símbolo: três barras que sobem (os ciclos de 90 dias) e o ponto amarelo
 * (o ritual da semana). Herda a cor do texto via currentColor.
 */
export function BrandSymbol({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect x="3" y="17" width="6" height="12" rx="2" fill="currentColor" opacity=".45" />
      <rect x="13" y="11" width="6" height="18" rx="2" fill="currentColor" opacity=".7" />
      <rect x="23" y="5" width="6" height="24" rx="2" fill="currentColor" />
      <circle cx="26" cy="2.6" r="2.4" fill="#f6e35a" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-lg font-extrabold tracking-tight text-grafite ${className}`}>
      <BrandSymbol className="text-tinta" />
      {BRAND.shortName}
    </span>
  );
}
