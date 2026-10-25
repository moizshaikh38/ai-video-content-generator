import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Run from server/ (npm test) — the page lives in the web app next door.
const page = fs.readFileSync(path.resolve(process.cwd(), '../src/pages/BillingPage.tsx'), 'utf8');

describe('Billing page — gateway-aware, honest states', () => {
  it('renders the server gateway decision and never offers a provider choice', () => {
    assert.match(page, /BillingService\.getBillingContext\(\)/);
    assert.doesNotMatch(page, /selectedProvider|providers\.map|Stripe|stripe/);
    assert.match(page, /GATEWAY_COPY\[context\.provider\]/);
    assert.match(page, /checkout\.provider === 'razorpay'[\s\S]*openRazorpaySubscriptionCheckout/);
    assert.match(page, /window\.location\.assign\(checkout\.url\)/, 'Paddle goes to its hosted checkout');
  });

  it('asks for the billing country before showing prices or checkout', () => {
    assert.match(page, /context\.requiresCountry \|\| editingCountry/);
    assert.match(page, /Choose your billing country above to see prices in your currency\./);
    assert.match(page, /confirmBillingCountry\(code, confirmConflict\)/);
    assert.match(page, /context\.countryLocked/);
  });

  it('never grants on the success redirect: it polls for the webhook-confirmed status', () => {
    assert.match(page, /searchParams\.get\('success'\) === 'true'[\s\S]*awaitActivation\(\)/);
    assert.match(page, /PAID_ACCESS\.includes\(ent\.subscription\.status\)/);
    assert.match(page, /CONFIRM_TIMEOUT_MS/);
  });

  it('has loading, empty, error and unavailable states', () => {
    assert.match(page, /<Skeleton /, 'loading skeletons');
    assert.match(page, /No payments yet\./, 'empty payment history');
    assert.match(page, /contextError[\s\S]*Try again/, 'error with retry');
    assert.match(page, /Not available yet/, 'price not configured');
    assert.match(page, /isn't configured on this server yet/, 'gateway not configured');
  });

  it('shows renewal, cancellation and payment-failure state accurately', () => {
    assert.match(page, /'Access ends' : 'Renews'/);
    assert.match(page, /Canceled — you keep/);
    assert.match(page, /isPastDue[\s\S]*Your last payment didn't go through/);
    assert.match(page, /subscription\?\.provider === 'paddle' &&[\s\S]*Manage payment & invoices/, 'portal only for Paddle');
  });

  it('is responsive: single column on phones, grids from sm/md/lg', () => {
    assert.match(page, /grid gap-4 md:grid-cols-2/);
    assert.match(page, /grid gap-4 sm:grid-cols-2 lg:grid-cols-4/);
    assert.match(page, /overflow-x-auto[\s\S]*min-w-\[520px\]/, 'payment table scrolls instead of overflowing');
  });

  it('formats money in the gateway currency (INR / USD), not a hard-coded $', () => {
    assert.match(page, /new Intl\.NumberFormat\(currency === 'INR' \? 'en-IN' : 'en-US'/);
    assert.doesNotMatch(page, /\$\{inv\.amount_paid/);
  });
});
