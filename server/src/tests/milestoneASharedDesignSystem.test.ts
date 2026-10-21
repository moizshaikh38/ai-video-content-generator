import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

describe('VireoClip — Milestone A: Shared Design System, Tokens & Navigation', () => {
  const indexCssPath = path.resolve(projectRoot, 'src/index.css');
  const indexCssContent = fs.readFileSync(indexCssPath, 'utf-8');

  const tailwindConfigPath = path.resolve(projectRoot, 'tailwind.config.js');
  const tailwindConfigContent = fs.readFileSync(tailwindConfigPath, 'utf-8');

  const buttonPath = path.resolve(projectRoot, 'src/components/Button.tsx');
  const buttonContent = fs.readFileSync(buttonPath, 'utf-8');

  const inputPath = path.resolve(projectRoot, 'src/components/Input.tsx');
  const inputContent = fs.readFileSync(inputPath, 'utf-8');

  const textareaPath = path.resolve(projectRoot, 'src/components/Textarea.tsx');
  const textareaContent = fs.readFileSync(textareaPath, 'utf-8');

  const selectPath = path.resolve(projectRoot, 'src/components/Select.tsx');
  const selectContent = fs.readFileSync(selectPath, 'utf-8');

  const cardPath = path.resolve(projectRoot, 'src/components/Card.tsx');
  const cardContent = fs.readFileSync(cardPath, 'utf-8');

  const spotlightCardPath = path.resolve(projectRoot, 'src/components/react-bits/SpotlightCard.tsx');
  const spotlightCardContent = fs.readFileSync(spotlightCardPath, 'utf-8');

  const dashboardLayoutPath = path.resolve(projectRoot, 'src/layouts/DashboardLayout.tsx');
  const dashboardLayoutContent = fs.readFileSync(dashboardLayoutPath, 'utf-8');

  const loginPagePath = path.resolve(projectRoot, 'src/pages/LoginPage.tsx');
  const loginPageContent = fs.readFileSync(loginPagePath, 'utf-8');

  const signupPagePath = path.resolve(projectRoot, 'src/pages/SignupPage.tsx');
  const signupPageContent = fs.readFileSync(signupPagePath, 'utf-8');

  const authLayoutPath = path.resolve(projectRoot, 'src/components/AuthLayout.tsx');
  const authLayoutContent = fs.readFileSync(authLayoutPath, 'utf-8');

  describe('1. Non-Auth Design Tokens Source of Truth', () => {
    test('defines canonical Obsidian/Graphite tokens in src/index.css', () => {
      assert.match(indexCssContent, /--vc-canvas:\s*#080B12;/, 'Canvas token must be #080B12');
      assert.match(indexCssContent, /--vc-surface-1:\s*#0F1420;/, 'Surface 1 token must be #0F1420');
      assert.match(indexCssContent, /--vc-surface-2:\s*#151C2C;/, 'Surface 2 token must be #151C2C');
      assert.match(indexCssContent, /--vc-surface-3:\s*#1B2438;/, 'Surface 3 token must be #1B2438');
      assert.match(indexCssContent, /--vc-border:\s*rgba\(255,\s*255,\s*255,\s*0\.07\);/, 'Subtle border must be rgba(255,255,255,0.07)');
      assert.match(indexCssContent, /--vc-border-strong:\s*rgba\(255,\s*255,\s*255,\s*0\.12\);/, 'Strong border must be rgba(255,255,255,0.12)');
      assert.match(indexCssContent, /--vc-text-primary:\s*#F4F6FB;/, 'Primary text must be #F4F6FB');
      assert.match(indexCssContent, /--vc-text-secondary:\s*#94A3B8;/, 'Secondary text must be #94A3B8');
      assert.match(indexCssContent, /--vc-accent-ai:\s*#8B5CF6;/, 'AI accent must be #8B5CF6');
      assert.match(indexCssContent, /--vc-success:\s*#10B981;/, 'Success token must be #10B981');
      assert.match(indexCssContent, /--vc-warning:\s*#F59E0B;/, 'Warning token must be #F59E0B');
      assert.match(indexCssContent, /--vc-destructive:\s*#EF4444;/, 'Destructive token must be #EF4444');
      assert.match(indexCssContent, /--vc-action-primary:\s*#F4F6FB;/, 'Primary action must be #F4F6FB');
      assert.match(indexCssContent, /--vc-action-primary-text:\s*#0B0C0F;/, 'Primary action text must be #0B0C0F');
    });

    test('tailwind.config.js exposes vc namespace mapped to CSS variables', () => {
      assert.match(tailwindConfigContent, /canvas:\s*'var\(--vc-canvas\)'/);
      assert.match(tailwindConfigContent, /surface1:\s*'var\(--vc-surface-1\)'/);
      assert.match(tailwindConfigContent, /surface2:\s*'var\(--vc-surface-2\)'/);
      assert.match(tailwindConfigContent, /'border':\s*'var\(--vc-border\)'|border:\s*'var\(--vc-border\)'/);
      assert.match(tailwindConfigContent, /'text-primary':\s*'var\(--vc-text-primary\)'/);
      assert.match(tailwindConfigContent, /ai:\s*'var\(--vc-accent-ai\)'/);
    });
  });

  describe('2. Critical Protected Scope (Login & Signup)', () => {
    test('LoginPage and SignupPage remain strictly unchanged and do not use modified shared components', () => {
      assert.ok(
        !loginPageContent.includes("from '../components/Button'"),
        'LoginPage must not import shared Button'
      );
      assert.ok(
        !loginPageContent.includes("from '../components/Input'"),
        'LoginPage must not import shared Input'
      );
      assert.ok(
        !signupPageContent.includes("from '../components/Button'"),
        'SignupPage must not import shared Button'
      );
      assert.ok(
        !signupPageContent.includes("from '../components/Input'"),
        'SignupPage must not import shared Input'
      );
    });

    test('AuthLayout retains its dedicated layout and styling structure intact', () => {
      assert.match(authLayoutContent, /export function AuthLayout/);
      assert.match(authLayoutContent, /AuthLayoutProps/);
    });
  });

  describe('3. Standardized Shared Components (Button, Input, Textarea, Select, Card)', () => {
    test('Button establishes clear semantic variants without making primary action violet', () => {
      // Primary action uses titanium white #F4F6FB with dark text #0B0C0F
      assert.match(buttonContent, /const neutralPrimaryClass =\s*['"]bg-\[#F4F6FB\] text-\[#0B0C0F\]/);
      // AI action is reserved for AI features with violet gradient
      assert.match(buttonContent, /const aiActionClass =\s*['"]bg-gradient-to-b from-\[#9B6BFF\] to-\[#7C3AED\]/);
      // Secondary action uses surface 2 #151C2C with titanium text
      assert.match(buttonContent, /secondary:\s*['"]bg-\[#151C2C\] hover:bg-\[#1C253B\] text-\[#F4F6FB\]/);
      // Destructive uses rose/red
      assert.match(buttonContent, /destructive:\s*['"]bg-rose-600/);
    });

    test('Input uses consistent height, curved glass surface, and visible focus ring', () => {
      assert.match(inputContent, /h-10/);
      assert.match(inputContent, /rounded-xl/);
      assert.match(inputContent, /bg-\[#0F1420\]/);
      assert.match(inputContent, /text-\[#F4F6FB\]/);
      assert.match(inputContent, /focus-visible:ring-2/);
      assert.match(inputContent, /border-white\/\[0\.08\]/);
    });

    test('Textarea matches Input styling and curvature', () => {
      assert.match(textareaContent, /rounded-xl/);
      assert.match(textareaContent, /bg-\[#0F1420\]/);
      assert.match(textareaContent, /text-\[#F4F6FB\]/);
      assert.match(textareaContent, /focus-visible:ring-2/);
    });

    test('Select matches Input dimensions and provides custom chevron', () => {
      assert.match(selectContent, /h-10/);
      assert.match(selectContent, /rounded-xl/);
      assert.match(selectContent, /bg-\[#0F1420\]/);
      assert.match(selectContent, /ChevronDown/);
    });

    test('Card and SpotlightCard use consistent token-driven surfaces and borders', () => {
      assert.match(cardContent, /bg-card/);
      assert.match(cardContent, /border-border/);
      assert.match(spotlightCardContent, /bg-card/);
      assert.match(spotlightCardContent, /border-border/);
    });
  });

  describe('4. Non-Auth Application Shell & Navigation', () => {
    test('DashboardLayout applies Obsidian/Graphite design tokens across sidebar and header', () => {
      assert.match(dashboardLayoutContent, /bg-\[var\(--vc-surface-1\)\]/);
      assert.match(dashboardLayoutContent, /border-\[var\(--vc-border\)\]/);
      assert.match(dashboardLayoutContent, /bg-\[var\(--vc-canvas\)\]/);
    });

    test('DashboardLayout navigation distinguishes standard active vs AI active states', () => {
      assert.match(dashboardLayoutContent, /vireo-nav-active/);
      assert.match(dashboardLayoutContent, /vireo-nav-active-ai/);
    });

    test('DashboardLayout includes search bar with Ctrl+K shortcut listener', () => {
      assert.match(dashboardLayoutContent, /Ctrl K/);
      assert.match(dashboardLayoutContent, /e\.key\.toLowerCase\(\) === 'k'/);
    });

    test('DashboardLayout supports responsive collapse/expand without overflow', () => {
      assert.match(dashboardLayoutContent, /collapsed \? 'w-\[78px\]/);
      assert.match(dashboardLayoutContent, /ChevronLeft/);
      assert.match(dashboardLayoutContent, /ChevronRight/);
    });
  });

  describe('5. Safety Guardrails', () => {
    test('getClipDownloadUrl in clipController.ts remains present and untouched', () => {
      const clipControllerPath = path.resolve(projectRoot, 'server/src/controllers/clipController.ts');
      const clipControllerContent = fs.readFileSync(clipControllerPath, 'utf-8');
      assert.ok(
        clipControllerContent.includes('export const getClipDownloadUrl = async'),
        'getClipDownloadUrl must remain present and intact'
      );
    });
  });
});
