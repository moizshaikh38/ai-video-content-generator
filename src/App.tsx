import React from 'react';
import { PageLoading } from './components/PageLoading';
import vireoSymbol from './assets/brand/vireoclip-symbol.svg';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { PublicOnlyRoute } from './components/PublicOnlyRoute';
import { RootLayout } from './layouts/RootLayout';
import { DashboardLayout } from './layouts/DashboardLayout';
const LandingPage = React.lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const LoginPage = React.lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const SignupPage = React.lazy(() => import('./pages/SignupPage').then(m => ({ default: m.SignupPage })));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ProjectDetailPage = React.lazy(() => import('./pages/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })));
const HistoryPage = React.lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage })));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const HelpPage = React.lazy(() => import('./pages/HelpPage').then(m => ({ default: m.HelpPage })));
const BrandPage = React.lazy(() => import('./pages/BrandPage').then(m => ({ default: m.BrandPage })));
const PublishingHistoryPage = React.lazy(() => import('./pages/PublishingHistoryPage').then(m => ({ default: m.PublishingHistoryPage })));
const BillingPage = React.lazy(() => import('./pages/BillingPage').then(m => ({ default: m.BillingPage })));
const ClipEditorPage = React.lazy(() => import('./pages/ClipEditorPage').then(m => ({ default: m.ClipEditorPage })));
const AdminPage = React.lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const SubtitleStudioPage = React.lazy(() => import('./pages/SubtitleStudioPage').then(m => ({ default: m.SubtitleStudioPage })));
const ContentStudioPage = React.lazy(() => import('./pages/ContentStudioPage').then(m => ({ default: m.ContentStudioPage })));
const WorkflowPage = React.lazy(() => import('./pages/WorkflowPage').then(m => ({ default: m.WorkflowPage })));
const WorkspacePage = React.lazy(() => import('./pages/WorkspacePage').then(m => ({ default: m.WorkspacePage })));
const TermsPage = React.lazy(() => import('./pages/TermsPage').then(m => ({ default: m.TermsPage })));
const PrivacyPage = React.lazy(() => import('./pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })));
const SupportPage = React.lazy(() => import('./pages/SupportPage').then(m => ({ default: m.SupportPage })));
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
import { CookieNotice } from './components/CookieNotice';

const CreateClipsRedirect: React.FC = () => {
  const [searchParams] = useSearchParams();
  const search = searchParams.toString();
  return <Navigate to={search ? `/dashboard?${search}` : '/dashboard'} replace />;
};

// Temporary gate: Analytics and A/B Testing are preserved in the codebase but show
// a Coming Soon screen while they are reworked. Restore the lazy imports + route
// elements to re-enable.
const ComingSoonGate: React.FC<{ feature: string }> = ({ feature }) => (
  <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center" role="status">
    <img src={vireoSymbol} alt="" className="h-12 w-auto opacity-90" />
    <div className="space-y-1.5">
      <h1 className="font-['Sora',sans-serif] text-xl sm:text-2xl font-extrabold text-white tracking-tight">{feature} is coming soon</h1>
      <p className="mx-auto max-w-sm text-xs sm:text-sm text-zinc-400">
        We are rebuilding this experience. Your existing projects and data are safe.
      </p>
    </div>
    <a href="/dashboard" className="mt-1 inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-500 transition-colors">
      Back to Dashboard
    </a>
  </div>
);

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppErrorBoundary>
      <BrowserRouter>
        <CookieNotice />
        <React.Suspense fallback={<PageLoading />}><Routes>
          {/* Public marketing layout with top navbar & footer */}
          <Route element={<RootLayout />}>
            <Route path="/" element={<LandingPage />} />
            {/* Pricing lives as the landing #pricing section; the nav link and
                any external /pricing references resolve there, not to a 404. */}
            <Route path="/pricing" element={<Navigate to="/#pricing" replace />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* Auth routes: only accessible when not logged in */}
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>

          {/* Protected dashboard routes: require authenticated session */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/workflows" element={<WorkflowPage />} />
              <Route path="/workspaces" element={<WorkspacePage />} />
              <Route path="/projects/new" element={<CreateClipsRedirect />} />
              <Route path="/subtitles" element={<SubtitleStudioPage />} />
              <Route path="/subtitles/:id" element={<SubtitleStudioPage />} />
              <Route path="/studio" element={<ContentStudioPage />} />
              <Route path="/studio/:id" element={<ContentStudioPage />} />
              <Route path="/new" element={<CreateClipsRedirect />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/media-library" element={<HistoryPage initialTab="clips" />} />
              <Route path="/brand" element={<BrandPage />} />
              <Route path="/publishing" element={<PublishingHistoryPage />} />
              <Route path="/analytics" element={<ComingSoonGate feature="Analytics" />} />
              <Route path="/ab-testing" element={<ComingSoonGate feature="A/B Testing" />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>

            {/* Focused studio editor */}
            <Route path="/clips/:clipId/edit" element={<ClipEditorPage />} />
          </Route>
        </Routes></React.Suspense>
      </BrowserRouter>
      </AppErrorBoundary>
    </AuthProvider>
  );
};

export default App;
