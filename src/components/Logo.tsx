import { Link } from 'react-router-dom';
import mark from '../assets/brand/vireo-mark.svg';

export interface LogoProps {
  to?: string;
  className?: string;
  compact?: boolean;
  light?: boolean;
}

export function Logo({ to = "/", className = "", compact = false, light = false }: LogoProps) {
  return (
    <Link to={to} aria-label="Vireo home" className={`inline-flex items-center gap-2 group ${className}`}>
      <img src={mark} alt="" className="size-9 shrink-0 transition-transform group-hover:scale-105" />
      {!compact && <span className={`text-[27px] font-bold tracking-[-0.07em] leading-none ${light ? 'text-white' : 'text-forest'}`}>Vireo</span>}
    </Link>
  );
}
