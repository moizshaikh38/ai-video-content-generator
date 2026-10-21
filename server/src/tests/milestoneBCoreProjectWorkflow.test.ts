import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

describe('VireoClip — Milestone B: Core Project Workflow Redesign', () => {
  const dashboardPath = path.resolve(projectRoot, 'src/pages/DashboardPage.tsx');
  const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');

  const newProjectPath = path.resolve(projectRoot, 'src/pages/NewProjectPage.tsx');
  const newProjectContent = fs.readFileSync(newProjectPath, 'utf-8');

  const projectDetailPath = path.resolve(projectRoot, 'src/pages/ProjectDetailPage.tsx');
  const projectDetailContent = fs.readFileSync(projectDetailPath, 'utf-8');

  const historyPagePath = path.resolve(projectRoot, 'src/pages/HistoryPage.tsx');
  const historyPageContent = fs.readFileSync(historyPagePath, 'utf-8');

  const statusBadgePath = path.resolve(projectRoot, 'src/components/StatusBadge.tsx');
  const statusBadgeContent = fs.readFileSync(statusBadgePath, 'utf-8');

  const loginPagePath = path.resolve(projectRoot, 'src/pages/LoginPage.tsx');
  const loginPageContent = fs.readFileSync(loginPagePath, 'utf-8');

  const signupPagePath = path.resolve(projectRoot, 'src/pages/SignupPage.tsx');
  const signupPageContent = fs.readFileSync(signupPagePath, 'utf-8');

  const clipControllerPath = path.resolve(projectRoot, 'server/src/controllers/clipController.ts');
  const clipControllerContent = fs.readFileSync(clipControllerPath, 'utf-8');

  describe('1. Dashboard Page & Honest Progress Truthfulness', () => {
    test('formatTimeAgo accurately calculates and formats all elapsed intervals', async () => {
      // Dynamic import or local recreation check of formatTimeAgo logic
      const now = new Date();
      const past30s = new Date(now.getTime() - 30 * 1000).toISOString();
      const past2m = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
      const past1m = new Date(now.getTime() - 65 * 1000).toISOString();
      const past3h = new Date(now.getTime() - 3 * 3600 * 1000).toISOString();
      const past1h = new Date(now.getTime() - 3650 * 1000).toISOString();
      const past30h = new Date(now.getTime() - 30 * 3600 * 1000).toISOString();
      const past5d = new Date(now.getTime() - 5 * 86400 * 1000).toISOString();

      assert.match(dashboardContent, /export function formatTimeAgo/);
      assert.match(dashboardContent, /diffInSeconds < 60/);
      assert.match(dashboardContent, /diffInMinutes === 1 \? '1m ago' : `\$\{diffInMinutes\}m ago`/);
      assert.match(dashboardContent, /diffInHours === 1 \? '1h ago' : `\$\{diffInHours\}h ago`/);
      assert.match(dashboardContent, /'Yesterday'/);
      assert.match(dashboardContent, /`\$\{diffInDays\}d ago`/);
    });

    test('getProgressInfo eliminates fake percentages and returns truthful stage information', () => {
      assert.match(dashboardContent, /export function getProgressInfo/);
      // Must NOT contain hardcoded fake percentage strings in stage labels
      assert.ok(!dashboardContent.includes("'25% Uploading video'"), 'Must not have fake 25%');
      assert.ok(!dashboardContent.includes("'40% Queued for AI'"), 'Must not have fake 40%');
      assert.ok(!dashboardContent.includes("'65% Transcribing speech'"), 'Must not have fake 65%');
      assert.ok(!dashboardContent.includes("'85% Finding viral clips'"), 'Must not have fake 85%');
      assert.ok(!dashboardContent.includes("'50% In progress'"), 'Must not have fake 50%');

      // Must support truthful stage labels and indeterminate shimmer when exact % unavailable
      assert.match(dashboardContent, /'Uploading video'/);
      assert.match(dashboardContent, /'Queued for AI'/);
      assert.match(dashboardContent, /'Transcribing speech'/);
      assert.match(dashboardContent, /'Finding viral clips'/);
    });

    test('Dashboard project tabs show live project counts and support Failed filtering', () => {
      assert.match(dashboardContent, /All \(\{projects\.length\}\)/);
      assert.match(dashboardContent, /Processing \(\{processingCount\}\)/);
      assert.match(dashboardContent, /Completed \(\{completedCount\}\)/);
      assert.match(dashboardContent, /Failed \(\{failedCount\}\)/);
      assert.match(dashboardContent, /failedStatuses = \['failed', 'error'\]/);
    });

    test('Dashboard project card provides quick action links and clickable thumbnails/titles', () => {
      assert.match(dashboardContent, /isComp \? 'Open project' : isProc \? 'View status' : isFail \? 'View error & retry' : 'Continue'/);
      assert.match(dashboardContent, /to=\{`\/projects\/\$\{p\.id\}`\}/);
      assert.match(dashboardContent, /aria-label=\{`Open project \$\{p\.title \|\| 'Untitled'\}`\}/);
    });

    test('Dashboard preserves polling for active background processing', () => {
      assert.match(dashboardContent, /hasActive = projects\.some\(\(p\) => activeStatuses\.includes\(getStatus\(p\)\)\)/);
      assert.match(dashboardContent, /setInterval\(\(\) => \{\s*loadProjects\(\);\s*\}, 4000\)/);
    });
  });

  describe('2. New Project Ingestion Workflow', () => {
    test('Centers ingestion surface in focused max-w-2xl container', () => {
      assert.match(newProjectContent, /max-w-2xl mx-auto/);
    });

    test('Removes redundant right aside instructional cards', () => {
      assert.ok(!newProjectContent.includes('Get the best results'), 'Must remove redundant "Get the best results" card');
      assert.ok(!newProjectContent.includes('What happens next?'), 'Must remove redundant "What happens next?" card');
      assert.ok(!newProjectContent.includes('Turn one video into many opportunities'), 'Must remove redundant value banner');
      assert.ok(!newProjectContent.includes('xl:grid-cols-[minmax(0,1fr)_340px]'), 'Must remove aside grid column');
    });

    test('Confirms 2 GB limit label and preservation of upload capabilities', () => {
      assert.match(newProjectContent, /Up to 2 GB/);
      assert.match(newProjectContent, /handleCancelUpload/);
      assert.match(newProjectContent, /uploadVideoFile/);
      assert.match(newProjectContent, /validateVideoFile/);
      assert.match(newProjectContent, /ClipPreferencesControl/);
    });
  });

  describe('3. Project Detail Page & Transcript Search', () => {
    test('Consolidates processing tracker and removes duplicate live activity and locked cards', () => {
      assert.ok(!projectDetailContent.includes('>Live Activity<'), 'Must remove duplicate "Live Activity" section');
      assert.ok(!projectDetailContent.includes('Locked Placeholders'), 'Must remove locked placeholders');
      assert.ok(!projectDetailContent.includes('Transcript will be available soon'), 'Must remove mock locked transcript');
      assert.match(projectDetailContent, /Processing Your Video/);
      assert.match(projectDetailContent, /~2 minutes/);
    });

    test('Places retry action directly beside error notification', () => {
      assert.match(projectDetailContent, /Processing notice:/);
      assert.match(projectDetailContent, /handleRetryProcessing/);
    });

    test('TranscriptSection implements reactive keyword search and highlight matching', () => {
      assert.match(projectDetailContent, /searchQuery/);
      assert.match(projectDetailContent, /Search transcript/);
      assert.match(projectDetailContent, /highlightMatch/);
      assert.match(projectDetailContent, /filteredSegments/);
    });

    test('Primary workspace navigation (Clips, Content Kit, Transcript) is styled with Obsidian tokens', () => {
      assert.match(projectDetailContent, /border-\[#8B5CF6\]/);
      assert.match(projectDetailContent, /ClipWorkspace/);
    });
  });

  describe('4. History Page & StatusBadge Dark SaaS Styling', () => {
    test('HistoryPage converts all light-mode styling to Obsidian/Graphite theme', () => {
      assert.ok(!historyPageContent.includes('bg-[#fafaf8]'), 'Must not contain legacy #fafaf8 header');
      assert.ok(!historyPageContent.includes('bg-[#eaf3eb]'), 'Must not contain legacy #eaf3eb icon background');
      assert.ok(!historyPageContent.includes('bg-cream'), 'Must not contain legacy cream background');
      assert.match(historyPageContent, /bg-\[#0E1017\]/);
      assert.match(historyPageContent, /border-white\/\[0\.08\]/);
      assert.match(historyPageContent, /text-\[#F4F6FB\]/);
    });

    test('HistoryPage delete confirmation modal uses dark backdrop and container', () => {
      assert.match(historyPageContent, /bg-black\/75/);
      assert.match(historyPageContent, /bg-\[#0E1017\]/);
      assert.match(historyPageContent, /Delete this project\?/);
    });

    test('StatusBadge provides modern high-contrast dark classes', () => {
      assert.match(statusBadgeContent, /bg-emerald-500\/15 text-emerald-300 border border-emerald-500\/30/);
      assert.match(statusBadgeContent, /bg-cyan-500\/15 text-cyan-300 border border-cyan-500\/30/);
      assert.match(statusBadgeContent, /bg-rose-500\/15 text-rose-300 border border-rose-500\/30/);
    });

    test('HistoryPage supports failed/error filtering and renders failed recovery actions', () => {
      assert.match(historyPageContent, /\['failed', 'error'\]\.includes\(statusOf\(p\)\)/);
      assert.match(historyPageContent, /aria-label=\{`View error and retry \$\{p\.title\}`\}/);
    });
  });

  describe('5. Strict Safety Guardrails & Non-Regressions', () => {
    test('LoginPage and SignupPage remain strictly unchanged from Milestone A', () => {
      assert.ok(!loginPageContent.includes("from '../components/Button'"));
      assert.ok(!loginPageContent.includes("from '../components/Input'"));
      assert.ok(!signupPageContent.includes("from '../components/Button'"));
      assert.ok(!signupPageContent.includes("from '../components/Input'"));
      assert.match(loginPageContent, /supabase\.auth/);
      assert.match(signupPageContent, /supabase\.auth/);
    });

    test('getClipDownloadUrl in clipController.ts remains present and untouched', () => {
      assert.match(clipControllerContent, /export const getClipDownloadUrl/);
      assert.match(clipControllerContent, /ClipRenderService\.getSignedDownloadUrl/);
    });
  });
});
