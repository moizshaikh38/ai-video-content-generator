import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Scissors,
  Video,
  Sparkles,
  FolderClosed,
  Share2,
  TrendingUp,
  FlaskConical,
  Brain,
  Building2,
  GitBranch,
  Settings,
  HelpCircle,
  Shield,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Zap,
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { NotificationsPopover } from '../components/NotificationsPopover';
import { useAuth } from '../context/AuthContext';
import { useBillingUsage } from '../hooks/useBillingUsage';
import '../styles/cinematic-motion.css';
import { BTN_PILL_BRAND, BTN_PILL_BRAND_SOFT } from '../lib/buttonStyles';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Create',
    items: [
      { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
      { to: '/projects/new', label: 'Create Clips', icon: Scissors },
      { to: '/history?tab=projects', label: 'Video Projects', icon: Video },
      { to: '/dashboard#studio', label: 'Content Studio', icon: Sparkles },
      { to: '/history?tab=clips', label: 'Media Library', icon: FolderClosed },
    ],
  },
  {
    title: 'Publish',
    items: [
      { to: '/publishing', label: 'Publishing', icon: Share2 },
      { to: '/analytics', label: 'Analytics', icon: TrendingUp },
      { to: '/ab-testing', label: 'A/B Testing', icon: FlaskConical },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { to: '/brand', label: 'Brand Brain', icon: Brain },
      { to: '/workspaces', label: 'Workspaces', icon: Building2 },
      { to: '/workflows', label: 'Workflows', icon: GitBranch },
    ],
  },
];

export const DashboardLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user, profile } = useAuth();
  const { usage } = useBillingUsage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const submitSearch = () => {
    const q = searchQuery.trim();
    navigate(q ? `/history?tab=projects&q=${encodeURIComponent(q)}` : '/history?tab=projects');
    searchInputRef.current?.blur();
  };

  // Global Ctrl+K / Cmd+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (searchInputRef.current && searchInputRef.current.offsetParent !== null) searchInputRef.current.focus();
        else navigate('/history?tab=projects');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'Creator';

  const userInitial = displayName.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const planLabel = usage?.is_unlimited
    ? 'Unlimited'
    : usage?.plan_tier
    ? `${usage.plan_tier.charAt(0).toUpperCase() + usage.plan_tier.slice(1)} Plan`
    : 'Free Plan';

  const usagePercent = usage?.is_unlimited
    ? 100
    : Math.min(
        100,
        Math.max(
          4,
          Math.round(
            ((usage?.total_used_minutes || 0) / (usage?.limit_minutes || 1)) * 100
          )
        )
      );

  return (
    <div className="min-h-screen bg-[var(--vc-canvas)] text-[var(--vc-text-primary)] flex flex-col lg:flex-row antialiased selection:bg-white/20 selection:text-white vc-app-scope">
      {/* Mobile Drawer Overlay */}
      {menuOpen && (
        <button
          type="button"
          className="glass-scrim fixed inset-0 z-40 lg:hidden cursor-default"
          aria-label="Close navigation drawer"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col glass-chrome border-r border-[var(--vc-border)] transition-all duration-300 lg:sticky lg:top-0 lg:h-screen ${
          collapsed ? 'w-[78px] px-2.5 py-4' : 'w-[252px] px-3.5 py-4'
        } ${
          menuOpen
            ? 'translate-x-0 shadow-[24px_0_60px_-12px_rgba(0,0,0,0.85)]'
            : '-translate-x-full lg:translate-x-0'
        }`}
        aria-label="Main sidebar navigation"
      >
        {/* Brand & Collapse Header */}
        <div
          className={`pb-3 border-b border-[var(--vc-border)] ${
            collapsed
              ? 'flex flex-col items-center gap-2.5'
              : 'flex items-center justify-between px-1.5'
          }`}
        >
          {!collapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <Logo to="/dashboard" variant="light" size="md" compact={false} />
            </div>
          ) : (
            <Logo to="/dashboard" variant="light" size="md" compact />
          )}

          {/* Desktop collapse toggle */}
          <button
            type="button"
            className="hidden lg:grid size-8 place-items-center rounded-xl border border-[var(--vc-border)] bg-white/[0.04] text-vc-text-secondary hover:text-vc-text-primary hover:bg-white/[0.08] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </button>

          {/* Mobile close button */}
          <button
            type="button"
            className="lg:hidden p-1.5 rounded-xl text-vc-text-secondary hover:bg-white/[0.06] hover:text-vc-text-primary transition-colors"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Workspace Switcher Button */}
        {!collapsed && (
          <button
            type="button"
            onClick={() => navigate('/workspaces')}
            className="mt-3.5 flex items-center gap-2.5 w-full p-2 rounded-xl bg-white/[0.03] border border-[var(--vc-border)] hover:border-[var(--vc-border-strong)] hover:bg-white/[0.06] text-left transition-all group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            title="Switch or manage workspaces"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet-600 text-white text-xs font-bold font-['Sora',sans-serif] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
              {displayName.charAt(0).toUpperCase()}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block truncate text-xs font-semibold text-vc-text-primary leading-tight group-hover:text-white">
                {displayName}&apos;s Studio
              </span>
              <span className="block truncate text-[11px] text-vc-text-secondary leading-tight">
                {planLabel} · 1 member
              </span>
            </span>
            <ChevronDown className="size-3.5 text-vc-text-secondary shrink-0 group-hover:text-vc-text-primary transition-colors" />
          </button>
        )}

        {/* Navigation Sections */}
        <nav
          aria-label="Dashboard links"
          className="mt-3 flex-1 overflow-y-auto overflow-x-hidden space-y-4 pr-0.5 scrollbar-none"
        >
          {navSections.map((section) => (
            <div key={section.title} className="space-y-0.5">
              {!collapsed && (
                <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-bold tracking-wider uppercase text-vc-text-muted font-['Sora',sans-serif]">
                  {section.title}
                </div>
              )}
              {section.items.map((item) => {
                const isExact = item.to === '/dashboard';
                const isActive = isExact
                  ? location.pathname === '/dashboard' && !location.hash
                  : item.to.includes('#')
                  ? location.hash === item.to.replace('/dashboard', '')
                  : location.pathname.startsWith(item.to);

                return (
                  <NavLink
                    key={item.label}
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                      collapsed ? 'justify-center' : ''
                    } ${
                      isActive
                        ? item.to === '/dashboard#studio'
                          ? 'vireo-nav-active-ai font-semibold'
                          : 'vireo-nav-active font-semibold'
                        : 'text-vc-text-secondary hover:bg-white/[0.05] hover:text-vc-text-primary border border-transparent'
                    }`}
                  >
                    <item.icon className="size-[17px] shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}

          {/* Admin console link if authorized */}
          {user?.email === 'vertexdigitals07@gmail.com' && (
            <div className="space-y-0.5 pt-1">
              {!collapsed && (
                <div className="px-2.5 text-[10.5px] font-bold tracking-wider uppercase text-amber-500/80 font-['Sora',sans-serif]">
                  Admin
                </div>
              )}
              <NavLink
                to="/admin"
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-all ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold'
                      : 'text-amber-400/80 hover:bg-amber-500/10 hover:text-amber-300 border border-transparent'
                  }`
                }
              >
                <Shield className="size-[17px] shrink-0" />
                {!collapsed && <span>Owner Console</span>}
              </NavLink>
            </div>
          )}

          {/* Utility bottom links */}
          <div className="pt-2 border-t border-white/[0.05] space-y-0.5">
            <NavLink
              to="/settings"
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-all ${
                  collapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'vireo-nav-active font-semibold'
                    : 'text-vc-text-secondary hover:bg-white/[0.05] hover:text-vc-text-primary border border-transparent'
                }`
              }
            >
              <Settings className="size-[17px] shrink-0" />
              {!collapsed && <span>Settings</span>}
            </NavLink>
            <NavLink
              to="/help"
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-all ${
                  collapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'vireo-nav-active font-semibold'
                    : 'text-vc-text-secondary hover:bg-white/[0.05] hover:text-vc-text-primary border border-transparent'
                }`
              }
            >
              <HelpCircle className="size-[17px] shrink-0" />
              {!collapsed && <span>Help &amp; tutorials</span>}
            </NavLink>
          </div>
        </nav>

        {/* Sidebar Footer: Actual Plan and Usage */}
        {!collapsed && (
          <div className="mt-auto pt-3 border-t border-[var(--vc-border)]">
            <div className="rounded-2xl bg-[var(--vc-surface-2)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-vc-text-primary">{planLabel}</span>
                <span className="text-[11px] font-mono text-vc-text-secondary">
                  {usage?.is_unlimited
                    ? 'Unlimited'
                    : `${Math.round(usage?.total_used_minutes || 0)} / ${usage?.limit_minutes || 15}m`}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-vc-ai transition-all duration-500"
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              <NavLink
                to="/billing"
                className={`mt-3 block w-full text-center py-1.5 text-xs font-semibold ${BTN_PILL_BRAND}`}
              >
                Upgrade Plan
              </NavLink>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="min-w-0 flex-1 flex flex-col">
        {/* Top Navigation Bar Matching Reference */}
        <header className="sticky top-0 z-30 flex h-[64px] sm:h-[68px] items-center justify-between gap-2.5 sm:gap-3 glass-chrome border-b border-[var(--vc-border)] px-3.5 sm:px-6 lg:px-8">
          {/* Mobile hamburger menu toggle */}
          <button
            type="button"
            className="lg:hidden p-2 rounded-xl text-vc-text-secondary hover:bg-white/[0.06] hover:text-vc-text-primary transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            aria-label="Open navigation drawer"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-5" />
          </button>

          {/* Search: type a project name, Enter opens the filtered project list (Ctrl/⌘ K focuses it) */}
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              submitSearch();
            }}
            className="hidden sm:flex items-center flex-1 max-w-[420px]"
          >
            <label className="flex items-center gap-2.5 w-full h-[38px] sm:h-[40px] px-3.5 rounded-full bg-white/[0.05] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] text-xs sm:text-[13px] text-vc-text-secondary hover:bg-white/[0.07] focus-within:bg-white/[0.08] focus-within:ring-2 focus-within:ring-violet-500/40 transition-all cursor-text">
              <Search className="size-4 shrink-0 text-vc-text-secondary" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchQuery('');
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Search projects"
                aria-label="Search projects"
                className="flex-1 min-w-0 bg-transparent text-vc-text-primary placeholder:text-vc-text-secondary outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-mono text-vc-text-secondary rounded-md bg-white/[0.06]">
                Ctrl K
              </kbd>
            </label>
          </form>

          {/* Mobile search icon button */}
          <button
            type="button"
            onClick={() => navigate('/history')}
            className="sm:hidden grid size-9 place-items-center rounded-xl border border-[var(--vc-border)] bg-[var(--vc-surface-1)] text-vc-text-secondary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            aria-label="Search"
          >
            <Search className="size-4" />
          </button>

          {/* Right actions */}
          <div className="flex items-center gap-2 sm:gap-2.5 ml-auto shrink-0">
            {/* Minutes left quota badge */}
            <div className="hidden xl:inline-flex items-center gap-1.5 h-[36px] sm:h-[38px] px-3 rounded-full bg-white/[0.04] text-xs font-medium text-zinc-200">
              <Zap className="size-3.5 text-zinc-300" />
              <span>
                {usage?.is_unlimited
                  ? 'Unlimited'
                  : `${Math.max(0, usage?.remaining_minutes || 0).toFixed(0)} min left`}
              </span>
            </div>

            {/* Upgrade Plan button */}
            <NavLink
              to="/billing"
              className={`hidden lg:inline-flex items-center justify-center h-[36px] sm:h-[38px] px-3.5 text-xs font-semibold ${BTN_PILL_BRAND_SOFT}`}
            >
              Upgrade
            </NavLink>

            {/* Prominent Create CTA Button */}
            <button
              type="button"
              onClick={() => navigate('/projects/new')}
              className={`inline-flex items-center justify-center gap-1.5 h-[36px] sm:h-[38px] px-3 sm:px-4 text-xs sm:text-sm font-semibold cursor-pointer shrink-0 ${BTN_PILL_BRAND}`}
            >
              <Plus className="size-4 stroke-[2.5]" />
              <span>Create</span>
            </button>

            {/* Notifications: recent project activity */}
            <NotificationsPopover buttonClassName="relative grid size-9 sm:size-[38px] place-items-center rounded-xl bg-white/[0.05] text-zinc-200 hover:bg-white/[0.09] hover:text-vc-text-primary transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40" />

            {/* User Profile dropdown */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setAccountOpen(!accountOpen)}
                aria-expanded={accountOpen}
                className="flex items-center gap-1.5 sm:gap-2 h-9 sm:h-[38px] px-1.5 sm:px-2 rounded-full border border-[var(--vc-border)] bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              >
                <span className="grid size-6 place-items-center rounded-full bg-zinc-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] font-bold text-white text-[11px]">
                  {userInitial}
                </span>
                <span className="hidden md:inline-block max-w-[100px] truncate text-xs font-semibold text-vc-text-primary">
                  {displayName}
                </span>
                <ChevronDown className="size-3 text-vc-text-secondary" />
              </button>

              {accountOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl glass-float p-1.5 z-50">
                  <div className="px-3 py-2.5 border-b border-[var(--vc-border)] mb-1">
                    <p className="text-xs font-semibold text-vc-text-primary truncate">{displayName}</p>
                    <p className="text-[11px] text-vc-text-secondary truncate">{user?.email}</p>
                    <span className="mt-1.5 inline-block text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-300 ">
                      {planLabel}
                    </span>
                  </div>
                  <NavLink
                    to="/settings"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:text-vc-text-primary hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  >
                    <Settings className="size-3.5 text-vc-text-secondary" />
                    Account Settings
                  </NavLink>
                  <NavLink
                    to="/billing"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:text-vc-text-primary hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  >
                    <Zap className="size-3.5 text-vc-text-secondary" />
                    Billing &amp; Subscription
                  </NavLink>
                  <NavLink
                    to="/help"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:text-vc-text-primary hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  >
                    <HelpCircle className="size-3.5 text-vc-text-secondary" />
                    Help &amp; tutorials
                  </NavLink>
                  <div className="my-1 border-t border-[var(--vc-border)]" />
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30"
                  >
                    <LogOut className="size-3.5" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content Viewport */}
        <main className="flex-1 w-full max-w-[1300px] mx-auto px-4 py-7 sm:px-6 sm:py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
