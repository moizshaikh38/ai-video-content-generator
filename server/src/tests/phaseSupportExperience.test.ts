import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Support experience (quality roadmap): dedicated /support page, grounded AI
 * assistant endpoint, upgraded legal-page shell. Server-side validation is
 * source-pinned (controllers need Mongo/Express runtime); the AI contract is
 * verified through the prompt constraints.
 */

describe('Support chat endpoint — safety contract', () => {
  const ctrl = fs.readFileSync(path.resolve(process.cwd(), 'src/controllers/supportController.ts'), 'utf8');

  it('system prompt is grounded in product facts and forbids invention', () => {
    assert.match(ctrl, /NEVER invent prices/);
    assert.match(ctrl, /ONLY questions about VireoClip/);
    assert.match(ctrl, /NEVER give legal advice/);
    assert.match(ctrl, /cannot perform account actions/);
    assert.match(ctrl, /vertexdigitals07@gmail\.com/);
  });

  it('input is sanitized and capped (message count, length, role, trailing-user)', () => {
    assert.match(ctrl, /MAX_MESSAGES = 12/);
    assert.match(ctrl, /MAX_MESSAGE_CHARS = 1500/);
    assert.match(ctrl, /m\.role === 'user' \|\| m\.role === 'assistant'/);
    assert.match(ctrl, /messages\[messages\.length - 1\]\.role !== 'user'/);
  });

  it('output is capped and failures degrade to a human-support message (503, no fake answers)', () => {
    assert.match(ctrl, /answer\.slice\(0, 4000\)/);
    assert.match(ctrl, /ASSISTANT_UNAVAILABLE/);
    assert.match(ctrl, /Email vertexdigitals07@gmail\.com/);
  });

  it('endpoint is public but rate-limited and registered', () => {
    const routes = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/supportRoutes.ts'), 'utf8');
    assert.match(routes, /supportLimiter/);
    assert.doesNotMatch(routes, /requireAuth/, 'support must be reachable pre-signup');
    const index = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/index.ts'), 'utf8');
    assert.match(index, /apiRouter\.use\('\/support', supportRoutes\)/);
    const limiter = fs.readFileSync(path.resolve(process.cwd(), 'src/middleware/rateLimiter.ts'), 'utf8');
    assert.match(limiter, /supportLimiter/);
  });
});

describe('Legal shell + pages — structure guards', () => {
  const shell = fs.readFileSync(path.resolve(process.cwd(), '../src/components/legal/LegalPageShell.tsx'), 'utf8');

  it('shell auto-generates a TOC from h2 ids and shows reading progress', () => {
    assert.match(shell, /querySelectorAll\('h2\[id\]'\)/);
    assert.match(shell, /role="progressbar"/);
    assert.match(shell, /LegalPageShellProps/);
  });

  it('Terms and Privacy render inside the shell with content preserved', () => {
    for (const [f, title] of [['src/pages/TermsPage.tsx', 'Terms of Service'], ['src/pages/PrivacyPage.tsx', 'Privacy Policy']]) {
      const src = fs.readFileSync(path.resolve(process.cwd(), '../' + f), 'utf8');
      assert.match(src, /<LegalPageShell/);
      assert.match(src, new RegExp(title));
      assert.match(src, /CONFIRMATION REQUIRED/, 'draft markers must survive the redesign');
      assert.doesNotMatch(src, /Back to VireoClip home/, 'manual back link replaced by shell chrome');
    }
  });

  it('/support route is registered as a lazy public route', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), '../src/App.tsx'), 'utf8');
    assert.match(app, /\/support"/);
    assert.match(app, /SupportPage = React\.lazy/);
  });

  it('support page links exist in the footer and the AI widget posts to the endpoint', () => {
    const footer = fs.readFileSync(path.resolve(process.cwd(), '../src/components/Footer.tsx'), 'utf8');
    assert.match(footer, /\/support/);
    const widget = fs.readFileSync(path.resolve(process.cwd(), '../src/components/support/SupportChatWidget.tsx'), 'utf8');
    assert.match(widget, /\/support\/chat/);
    assert.match(widget, /prefers-reduced-motion|mv-page/);
  });
});
