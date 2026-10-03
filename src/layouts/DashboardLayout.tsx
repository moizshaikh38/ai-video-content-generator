import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Video, PlusCircle, LayoutDashboard, ArrowLeft } from 'lucide-react';
import { Container } from '../components/Container';
import { Button } from '../components/Button';

export const DashboardLayout: React.FC = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Dashboard Topbar */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <Container size="lg">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-6">
              <Link to="/" className="flex items-center gap-2 group">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                  <Video className="w-4 h-4" />
                </div>
                <span className="font-bold text-white tracking-tight">OmniVid</span>
              </Link>

              <div className="h-4 w-px bg-slate-800 hidden sm:block" />

              <nav className="flex items-center gap-2">
                <Link
                  to="/dashboard"
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === '/dashboard'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Projects</span>
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <Link to="/" className="text-xs text-slate-400 hover:text-slate-200 hidden sm:flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Site
              </Link>
              <Link to="/projects/new">
                <Button variant="primary" size="sm" leftIcon={<PlusCircle className="w-4 h-4" />}>
                  New Project
                </Button>
              </Link>
            </div>
          </div>
        </Container>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-8">
        <Container size="lg">
          <Outlet />
        </Container>
      </main>
    </div>
  );
};
