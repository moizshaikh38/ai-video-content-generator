import { Link } from 'react-router-dom';

export interface LogoProps {
  to?: string;
  className?: string;
}

export function Logo({ to = "/", className = "" }: LogoProps) {
  return (
    <Link to={to} className={`flex items-center gap-3 group ${className}`}>
      <div className="grid size-10 place-items-center rounded-2xl bg-ink shadow-ink transition-transform group-hover:scale-105">
        <span className="text-base font-bold text-cream">V</span>
      </div>
      <span className="font-display text-xl font-semibold tracking-tight text-foreground">Vireo</span>
    </Link>
  );
}
