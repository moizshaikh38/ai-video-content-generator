import { Link } from "react-router-dom";
import type { MouseEventHandler } from "react";
import darkLogo from "../assets/brand/vireoclip-logo-dark.svg";
import lightLogo from "../assets/brand/vireoclip-logo-light.svg";
import symbol from "../assets/brand/vireoclip-symbol.svg";

export interface LogoProps {
  to?: string;
  className?: string;
  symbolOnly?: boolean;
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  compact?: boolean;
  light?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

const fullLogoSizes = { sm: "h-7", md: "h-9", lg: "h-11" } as const;
const symbolSizes = { sm: "h-6", md: "h-9", lg: "h-12" } as const;

export function Logo({
  to = "/",
  className = "",
  symbolOnly = false,
  variant = "dark",
  size = "md",
  compact = false,
  light = false,
  onClick,
}: LogoProps) {
  const showSymbol = symbolOnly || compact;
  const resolvedVariant = light ? "light" : variant;
  const source = showSymbol ? symbol : resolvedVariant === "light" ? lightLogo : darkLogo;

  return (
    <Link to={to} aria-label="VireoClip home" onClick={onClick} className={`group inline-flex shrink-0 items-center ${className}`}>
      <img
        src={source}
        alt=""
        className={`${showSymbol ? symbolSizes[size] : fullLogoSizes[size]} w-auto transition-transform group-hover:scale-[1.03]`}
      />
    </Link>
  );
}
