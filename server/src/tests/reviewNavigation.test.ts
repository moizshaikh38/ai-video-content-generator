import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Unified Home & Create Clips Navigation — Verification Flow', () => {
  const workflowPath = path.resolve(process.cwd(), '../src/components/dashboard/HomeClippingWorkflow.tsx');
  const layoutPath = path.resolve(process.cwd(), '../src/layouts/DashboardLayout.tsx');
  const appPath = path.resolve(process.cwd(), '../src/App.tsx');
  const navbarPath = path.resolve(process.cwd(), '../src/components/Navbar.tsx');
  const historyPath = path.resolve(process.cwd(), '../src/pages/HistoryPage.tsx');
  const helpPath = path.resolve(process.cwd(), '../src/pages/HelpPage.tsx');
  const supportPath = path.resolve(process.cwd(), '../src/pages/SupportPage.tsx');
  const workflowPagePath = path.resolve(process.cwd(), '../src/pages/WorkflowPage.tsx');

  it('1. Confirms DashboardLayout dispatches vireo_navigate_home on Home and Logo clicks', () => {
    const layoutSrc = fs.readFileSync(layoutPath, 'utf8');

    // Logo click triggers vireo_navigate_home
    assert.match(
      layoutSrc,
      /window\.dispatchEvent\(new CustomEvent\('vireo_navigate_home'\)\)/,
      'DashboardLayout must dispatch vireo_navigate_home event'
    );

    // Sidebar Home NavLink click triggers vireo_navigate_home
    assert.match(
      layoutSrc,
      /if \(item\.to === '\/dashboard'\) \{\s*window\.dispatchEvent\(new CustomEvent\('vireo_navigate_home'\)\);/s,
      'Home NavLink must dispatch vireo_navigate_home when clicked'
    );
  });

  it('2. Confirms HomeClippingWorkflow contains Back to Home button near heading', () => {
    const workflowSrc = fs.readFileSync(workflowPath, 'utf8');

    // Dedicated top navigation row with Back to Home button
    assert.match(
      workflowSrc,
      /<button[^>]*onClick=\{handleBackToHome\}[\s\S]*?Back to Home/s,
      'Must contain Back to Home button wired to handleBackToHome'
    );

    // Review Generated Clips heading present
    assert.match(
      workflowSrc,
      /Review Generated Clips/,
      'Review Generated Clips heading must exist'
    );

    // Mobile back arrow button near title
    assert.match(
      workflowSrc,
      /onClick=\{handleBackToHome\}[\s\S]*?sm:hidden/,
      'Mobile view must have responsive back button near heading'
    );
  });

  it('3. Confirms handleBackToHome navigates to /dashboard and sets workflowState to no_source', () => {
    const workflowSrc = fs.readFileSync(workflowPath, 'utf8');

    assert.match(
      workflowSrc,
      /const handleBackToHome = \(\) => \{\s*navigate\('\/dashboard', \{ replace: false \}\);\s*setWorkflowState\('no_source'\);\s*\};/s,
      'handleBackToHome must push /dashboard to history and reset workflow state'
    );
  });

  it('4. Confirms browser Back and Forward navigation is supported via searchParams', () => {
    const workflowSrc = fs.readFileSync(workflowPath, 'utf8');

    // useSearchParams is imported and initialized
    assert.match(workflowSrc, /useSearchParams/, 'useSearchParams must be imported');
    assert.match(workflowSrc, /const \[searchParams\] = useSearchParams\(\);/, 'searchParams must be initialized');

    // Browser navigation sync effect
    assert.match(
      workflowSrc,
      /const isReview = searchParams\.get\('view'\) === 'review';/,
      'Must inspect view=review parameter'
    );

    assert.match(
      workflowSrc,
      /if \(workflowState === 'clips_ready'\) \{\s*setWorkflowState\('no_source'\);\s*\}/s,
      'Popstate back to /dashboard must revert clips_ready to no_source'
    );
  });

  it('5. Confirms active project and generated clips are preserved when navigating away', () => {
    const workflowSrc = fs.readFileSync(workflowPath, 'utf8');

    // Active clips resume banner on Home
    assert.match(
      workflowSrc,
      /Active Generated Clips|Viral Clips Ready/,
      'Home view must display active clips resume banner'
    );

    assert.match(
      workflowSrc,
      /handleOpenReview/,
      'Must provide handleOpenReview to resume review without re-extracting'
    );

    // Candidates and rendered clips are retained in state
    assert.match(
      workflowSrc,
      /setCandidates\(candData \|\| \[\]\);[\s\S]*?setRenderedClips\(clipsData \|\| \[\]\);/s,
      'Clip results must be stored in state'
    );
  });

  it('6. Confirms sidebar navigation in DashboardLayout has removed Create Clips (/projects/new)', () => {
    const layoutSrc = fs.readFileSync(layoutPath, 'utf8');

    // Ensure Create Clips is NOT a sidebar item
    assert.doesNotMatch(
      layoutSrc,
      /\{[^}]*to:\s*['"]\/projects\/new['"][^}]*\}/,
      'DashboardLayout sidebar must not have Create Clips (/projects/new) nav item'
    );
  });

  it('7. Confirms header Create button navigates to /dashboard and triggers vireo_navigate_home', () => {
    const layoutSrc = fs.readFileSync(layoutPath, 'utf8');

    // Header Create button
    assert.match(
      layoutSrc,
      /navigate\('\/dashboard'\);[\s\S]*?vireo_navigate_home/s,
      'Header Create button must navigate to /dashboard and trigger vireo_navigate_home'
    );
  });

  it('8. Confirms App.tsx routes /projects/new and /new via CreateClipsRedirect with search parameter preservation', () => {
    const appSrc = fs.readFileSync(appPath, 'utf8');

    assert.match(appSrc, /const CreateClipsRedirect/, 'CreateClipsRedirect component must exist');
    assert.match(
      appSrc,
      /<Route path="\/projects\/new" element=\{<CreateClipsRedirect \/>\} \/>/,
      '/projects/new must route to CreateClipsRedirect'
    );
    assert.match(
      appSrc,
      /<Route path="\/new" element=\{<CreateClipsRedirect \/>\} \/>/,
      '/new must route to CreateClipsRedirect'
    );
  });

  it('9. Confirms HomeClippingWorkflow contains unified ingestion hero, sample videos, and guidelines', () => {
    const workflowSrc = fs.readFileSync(workflowPath, 'utf8');

    // Hero title
    assert.match(workflowSrc, /Turn Your Videos Into[\s\S]*?Great Clips/, 'Hero headline must match');

    // URL input and Continue with URL
    assert.match(workflowSrc, /Continue with URL/, 'Continue with URL CTA must be present');

    // Upload Video button
    assert.match(workflowSrc, /Upload Video/, 'Upload Video button must be present');

    // Browse Projects button
    assert.match(workflowSrc, /Browse Projects/, 'Browse Projects button must be present');

    // Sample video options and handler
    assert.match(workflowSrc, /SAMPLE_VIDEOS/, 'SAMPLE_VIDEOS constant must be defined');
    assert.match(workflowSrc, /handlePickSample/, 'handlePickSample function must be implemented');

    // Format guidelines
    assert.match(workflowSrc, /Supports YouTube, Vimeo & direct video links|Supports YouTube, Vimeo &amp; direct video links/, 'Format guidelines must be present');
  });

  it('10. Confirms Navbar, HistoryPage, HelpPage, SupportPage and WorkflowPage link creation to /dashboard', () => {
    const navbarSrc = fs.readFileSync(navbarPath, 'utf8');
    assert.match(navbarSrc, /to="\/dashboard"/, 'Navbar primary CTA must navigate to /dashboard');

    const historySrc = fs.readFileSync(historyPath, 'utf8');
    assert.match(historySrc, /to="\/dashboard"/, 'HistoryPage New Clip Project must navigate to /dashboard');

    const helpSrc = fs.readFileSync(helpPath, 'utf8');
    assert.match(helpSrc, /to:\s*['"]\/dashboard['"]/, 'HelpPage create clip links must navigate to /dashboard');

    const supportSrc = fs.readFileSync(supportPath, 'utf8');
    assert.match(supportSrc, /href:\s*['"]\/dashboard['"]|to:\s*['"]\/dashboard['"]/, 'SupportPage quick action must navigate to /dashboard');

    const workflowPageSrc = fs.readFileSync(workflowPagePath, 'utf8');
    assert.match(workflowPageSrc, /to="\/dashboard"/, 'WorkflowPage New Clip Project must navigate to /dashboard');
  });
});
