import { DashboardLayout } from '../layouts/DashboardLayout';
import { DashboardPage } from '../pages/DashboardPage';
// TEST-ONLY E2E harness: mounts the REAL ClipEditorPage (My Clips -> Edit /
// Media Library -> Studio path) against a real local API server with a stubbed
// Supabase session, so clicks drive the actual save/reload/render pipeline.
import { Suspense } from 'react';
import '../index.css';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AuthProvider } from '../context/AuthContext';
import { HomeClippingWorkflow } from '../components/dashboard/HomeClippingWorkflow';

const E2E_USER = { id: '11111111-1111-4111-8111-111111111111', email: 'e2e@vireoclip.test' };
const E2E_SESSION = {
  access_token: 'e2e-studio-token',
  refresh_token: 'e2e-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: E2E_USER,
};

(supabase.auth as any).getSession = async () => ({ data: { session: E2E_SESSION }, error: null });
(supabase.auth as any).refreshSession = async () => ({ data: { session: E2E_SESSION }, error: null });
(supabase.auth as any).onAuthStateChange = () => ({ data: { subscription: { unsubscribe: () => {} } } });
// Expose the token for CDP-side API reads.
(window as any).__E2E_TOKEN = 'e2e-studio-token';

const params = new URLSearchParams(window.location.search);
params.get('clip');

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <AuthProvider>
      <Suspense fallback={<div>loading</div>}>
        <Routes>
          {params.get('shell')?<Route element={<DashboardLayout/>}><Route path="/dashboard" element={<DashboardPage/>}/></Route>:<Route path="/dashboard" element={<div style={{padding:24,maxWidth:1200,margin:"auto"}}><HomeClippingWorkflow existingProjects={[]} onRefreshProjects={()=>{}} onScrollToProjects={()=>{}} /></div>} />}
        </Routes>
      </Suspense>
    </AuthProvider>
  </MemoryRouter>
);
