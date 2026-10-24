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
    test('defines the canonical Black Glass tokens in src/index.css (no navy tint)', () => {
      assert.match(indexCssContent, /--vc-canvas:\s*#000000;/, 'Canvas token must be pure black #000000');
      assert.match(indexCssContent, /--vc-surface-1:\s*#0E0E0E;/, 'Surface 1 token must be #0E0E0E');
      assert.match(indexCssContent, /--vc-surface-2:\s*#161616;/, 'Surface 2 token must be #161616');
      assert.match(indexCssContent, /--vc-surface-3:\s*#1E1E1E;/, 'Surface 3 token must be #1E1E1E');
      assert.match(indexCssContent, /--vc-border:\s*rgba\(255,\s*255,\s*255,\s*0\.08\);/, 'Subtle border must be rgba(255,255,255,0.08)');
      assert.match(indexCssContent, /--vc-border-strong:\s*rgba\(255,\s*255,\s*255,\s*0\.14\);/, 'Strong border must be rgba(255,255,255,0.14)');
      assert.match(indexCssContent, /--vc-text-primary:\s*#FAFAFA;/, 'Primary text must be #FAFAFA');
      assert.match(indexCssContent, /--vc-text-secondary:\s*#A1A1AA;/, 'Secondary text must be zinc #A1A1AA');
      assert.match(indexCssContent, /--vc-text-muted:\s*#71717A;/, 'Muted text must be zinc #71717A');
      assert.match(indexCssContent, /--vc-accent-ai:\s*#8B5CF6;/, 'AI accent must be #8B5CF6');
      assert.match(indexCssContent, /--vc-success:\s*#10B981;/, 'Success token must be #10B981');
      assert.match(indexCssContent, /--vc-warning:\s*#F59E0B;/, 'Warning token must be #F59E0B');
      assert.match(indexCssContent, /--vc-destructive:\s*#EF4444;/, 'Destructive token must be #EF4444');
      assert.match(indexCssContent, /--vc-action-primary:\s*#FAFAFA;/, 'Primary action must be #FAFAFA');
      assert.match(indexCssContent, /--vc-action-primary-text:\s*#0A0A0A;/, 'Primary action text must be #0A0A0A');
    });

    test('tailwind.config.js exposes vc namespace mapped to CSS variables', () => {
      assert.match(tailwindConfigContent, /canvas:\s*'rgb\(var\(--vc-canvas-rgb\) \/ <alpha-value>\)'/);
      assert.match(tailwindConfigContent, /surface1:\s*'rgb\(var\(--vc-surface-1-rgb\) \/ <alpha-value>\)'/);
      assert.match(tailwindConfigContent, /surface2:\s*'rgb\(var\(--vc-surface-2-rgb\) \/ <alpha-value>\)'/);
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
      // Primary and AI variants come from the shared pill recipes.
      assert.match(buttonContent, /default:\s*BTN_PILL_PRIMARY/);
      assert.match(buttonContent, /primary:\s*BTN_PILL_PRIMARY/);
      assert.match(buttonContent, /ai:\s*BTN_PILL_AI/);
      assert.match(buttonContent, /secondary:\s*BTN_PILL_SECONDARY/);
      assert.match(buttonContent, /destructive:\s*BTN_PILL_DESTRUCTIVE/);
      assert.ok(!/bg-gradient-to/.test(buttonContent), 'Button must not use gradients');
    });

    test('Input uses consistent height, recessed surface, and visible focus ring', () => {
      assert.match(inputContent, /h-10/);
      assert.match(inputContent, /rounded-xl/);
      assert.match(inputContent, /bg-white\/\[0\.03\]/);
      assert.match(inputContent, /text-vc-text-primary/);
      assert.match(inputContent, /focus-visible:ring-2/);
      assert.match(inputContent, /border-white\/\[0\.08\]/);
    });

    test('Textarea matches Input styling and curvature', () => {
      assert.match(textareaContent, /rounded-xl/);
      assert.match(textareaContent, /bg-white\/\[0\.03\]/);
      assert.match(textareaContent, /text-vc-text-primary/);
      assert.match(textareaContent, /focus-visible:ring-2/);
    });

    test('Select matches Input dimensions and provides custom chevron', () => {
      assert.match(selectContent, /h-10/);
      assert.match(selectContent, /rounded-xl/);
      assert.match(selectContent, /bg-white\/\[0\.03\]/);
      assert.match(selectContent, /ChevronDown/);
    });

    test('Card and SpotlightCard use token-driven surfaces without decorative outlines', () => {
      assert.match(cardContent, /bg-card/);
      assert.ok(!/border border-border/.test(cardContent), 'Card must not draw an outline');
      assert.match(spotlightCardContent, /bg-card/);
      assert.ok(!/border border-border/.test(spotlightCardContent), 'SpotlightCard must not draw an outline');
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
