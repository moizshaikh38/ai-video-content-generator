import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutGrid, Plus, History, Settings, LogOut, User } from 'lucide-react';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/projects/new', label: 'New', icon: Plus },
  { to: '/history', label: 'History', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

export const DashboardLayout: React.FC = () => {
  const navigate = useNavigate();
  const { signOut, user, profile } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Creator';

  return (
    <div className="min-h-screen pb-24 md:pb-12 bg-background text-foreground">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo to="/dashboard" />

        {/* Desktop Navigation Links */}
        <nav className="hidden items-center gap-1.5 md:flex bg-secondary/50 p-1 rounded-full border border-border/60">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-card text-foreground shadow-soft border border-border/80'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        {/* User Badge & Sign Out Button */}
        <div className="flex items-center gap-2">
          {user && (
            <span className="hidden lg:inline-flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1 rounded-full bg-cream/80 border border-border/50">
              <User className="size-3 text-clay" />
              <span className="font-medium text-foreground">{displayName}</span>
            </span>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline font-medium text-xs">Sign out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <Outlet />
      </main>

      {/* Mobile Floating Bottom Bar */}
      <nav className="fixed inset-x-4 bottom-4 z-40 grid grid-cols-4 rounded-3xl bg-card p-1.5 shadow-lift border border-border md:hidden">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-medium transition-colors ${
                isActive ? 'bg-cream text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            <l.icon className="size-5" />
            {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
