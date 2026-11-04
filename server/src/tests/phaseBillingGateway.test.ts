import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { lookupCountryForIp, isPublicIp, setGeoFetchForTests } from '../services/billing/ipGeoService.js';
import {
  normalizeCountryCode,
  gatewayForCountry,
  detectGatewayConflict,
  resolveCountry,
  buildBillingContext,
} from '../services/billing/billingCountryService.js';

/**
 * Billing gateway routing (spec §3): IN → Razorpay only, supported non-IN →
 * Paddle only; server-authoritative country resolution; conflicts require
 * confirmation; provider lock; untrusted inputs never decide the gateway.
 */

describe('Gateway routing — country → provider', () => {
  it('India routes to Razorpay (INR); supported others route to Paddle (USD)', () => {
    assert.deepEqual(gatewayForCountry('IN'), { ok: true, provider: 'razorpay', currency: 'INR' });
    assert.deepEqual(gatewayForCountry('US'), { ok: true, provider: 'paddle', currency: 'USD' });
    assert.deepEqual(gatewayForCountry('GB'), { ok: true, provider: 'paddle', currency: 'USD' });
  });

  it('Paddle-blocked countries get a clear refusal, never a silent fallback', () => {
    const blocked = gatewayForCountry('IR');
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.code, 'COUNTRY_NOT_SUPPORTED');
      assert.match(blocked.message, /not available/);
    }
  });

  it('country codes are normalized to ISO 3166-1 alpha-2 and validated', () => {
    assert.equal(normalizeCountryCode(' in '), 'IN');
    assert.equal(normalizeCountryCode('us'), 'US');
    assert.equal(normalizeCountryCode('ZZ'), null); // non-billing code
    assert.equal(normalizeCountryCode('USA'), null); // not alpha-2
    assert.equal(normalizeCountryCode('X1'), null);
    assert.equal(normalizeCountryCode(42), null);
    assert.equal(normalizeCountryCode(''), null);
  });
});

describe('IP geolocation — server-side only, fail-safe', () => {
  it('private, loopback, and invalid addresses never resolve to a country', async () => {
    setGeoFetchForTests(null);
    assert.equal(await lookupCountryForIp('127.0.0.1'), null);
    assert.equal(await lookupCountryForIp('192.168.1.5'), null);
    assert.equal(await lookupCountryForIp('10.0.0.1'), null);
    assert.equal(await lookupCountryForIp('::1'), null);
    assert.equal(await lookupCountryForIp('not-an-ip'), null);
    assert.equal(await lookupCountryForIp(null), null);
    assert.equal(isPublicIp('8.8.8.8'), true);
    assert.equal(isPublicIp('169.254.1.1'), false);
  });

  it('successful lookups return the ISO code and are cached per IP', async () => {
    let calls = 0;
    setGeoFetchForTests(async () => {
      calls++;
      return { ok: true, json: async () => ({ success: true, country_code: 'in' }) };
    });
    assert.equal(await lookupCountryForIp('8.8.4.4'), 'IN');
    assert.equal(await lookupCountryForIp('8.8.4.4'), 'IN');
    assert.equal(calls, 1, 'second lookup served from cache');
    setGeoFetchForTests(null);
  });

  it('every failure mode resolves to null (ask-the-customer path)', async () => {
    setGeoFetchForTests(async () => { throw new Error('timeout'); });
    assert.equal(await lookupCountryForIp('1.1.1.1'), null);
    setGeoFetchForTests(async () => ({ ok: false, json: async () => ({ success: false }) }));
    assert.equal(await lookupCountryForIp('1.1.1.2'), null);
    setGeoFetchForTests(async () => ({ ok: true, json: async () => ({ success: true, country_code: 'ZZZ' }) }));
    assert.equal(await lookupCountryForIp('1.1.1.3'), null);
    setGeoFetchForTests(null);
  });
});

describe('Country resolution precedence and conflicts', () => {
  it('confirmed country beats subscription, IP, and headers', () => {
    const r = resolveCountry({
      confirmedCountry: 'US',
      subscription: { provider: 'razorpay', billing_country: 'IN' },
      ipCountry: 'DE',
      headers: { 'cf-ipcountry': 'GB' },
    });
    assert.deepEqual(r, { country: 'US', source: 'confirmed' });
  });

  it('an existing subscription pins the country (provider lock) regardless of IP', () => {
    const r = resolveCountry({
      subscription: { provider: 'razorpay', billing_country: null },
      ipCountry: 'US',
    });
    assert.deepEqual(r, { country: 'IN', source: 'subscription' });
  });

  it('IP geolocation is advisory only when nothing stronger exists', () => {
    assert.deepEqual(resolveCountry({ ipCountry: 'DE' }), { country: 'DE', source: 'ip' });
    assert.deepEqual(resolveCountry({}), { country: null, source: null });
  });

  it('trusted edge header is used only when explicitly configured', () => {
    const headers = { 'cf-ipcountry': 'GB' };
    assert.deepEqual(resolveCountry({ headers, trustedHeader: 'cf-ipcountry' }), { country: 'GB', source: 'edge_header' });
    assert.deepEqual(resolveCountry({ headers }), { country: null, source: null });
    // Untrusted header values are normalized/validated like everything else.
    assert.deepEqual(resolveCountry({ headers: { 'cf-ipcountry': 'USA' }, trustedHeader: 'cf-ipcountry' }), { country: null, source: null });
  });

  it('conflicts exist only when confirmed and IP countries imply DIFFERENT providers', () => {
    const conflict = detectGatewayConflict('IN', 'US');
    assert.ok(conflict);
    assert.equal(conflict!.confirmedProvider, 'razorpay');
    assert.equal(conflict!.ipProvider, 'paddle');

    assert.equal(detectGatewayConflict('US', 'GB'), null); // same provider
    assert.equal(detectGatewayConflict('US', 'US'), null); // same country
    assert.equal(detectGatewayConflict(null, 'US'), null); // nothing to conflict
  });

  it('context surfaces conflicts for confirmed countries but not for IP-only guesses', () => {
    const confirmedCtx = buildBillingContext(
      resolveCountry({ confirmedCountry: 'IN' }),
      false,
      { ipCountry: 'US' }
    );
    assert.ok(confirmedCtx.conflict, 'confirmed IN + observed US must surface a conflict');
    assert.equal(confirmedCtx.provider, 'razorpay', 'confirmed decision stands — no silent switch');
    assert.equal(confirmedCtx.ipCountry, 'US');

    const ipOnlyCtx = buildBillingContext(resolveCountry({ ipCountry: 'US' }), false, { ipCountry: 'US' });
    assert.equal(ipOnlyCtx.conflict, null);
    assert.equal(ipOnlyCtx.provider, 'paddle');

    const unknownCtx = buildBillingContext(resolveCountry({}), false, { ipCountry: null });
    assert.equal(unknownCtx.requiresCountry, true);
    assert.equal(unknownCtx.provider, null);
  });
});

describe('Checkout enforcement — wiring guards', () => {
  const controller = fs.readFileSync(path.resolve(process.cwd(), 'src/controllers/billingController.ts'), 'utf8');

  it('checkout derives the provider from the server billing context, never the body alone', () => {
    assert.match(controller, /resolveBillingContext\(userId, req\.ip\)/);
    assert.match(controller, /const providerName: BillingProviderName = context\.provider;/);
  });

  it('wrong-provider requests are rejected, not silently honored', () => {
    assert.match(controller, /PROVIDER_NOT_ELIGIBLE/);
    assert.match(controller, /PROVIDER_LOCKED/);
  });

  it('missing country blocks checkout until selection (412), conflicts require confirmation (409)', () => {
    assert.match(controller, /COUNTRY_REQUIRED/);
    assert.match(controller, /COUNTRY_CONFLICT/);
  });

  it('context and country-confirm endpoints are registered with auth', () => {
    const routes = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/billingRoutes.ts'), 'utf8');
    assert.match(routes, /router\.get\('\/context', requireAuth/);
    assert.match(routes, /router\.post\('\/country', requireAuth/);
  });

  it('country confirmation gates conflicts behind confirm_conflict and locks subscribers', () => {
    const resolver = fs.readFileSync(path.resolve(process.cwd(), 'src/services/billing/billingCountryResolver.ts'), 'utf8');
    assert.match(resolver, /detectGatewayConflict\(existingConfirmed, country\)/);
    assert.match(resolver, /detectGatewayConflict\(country, ipCountry\)/);
    assert.match(resolver, /PROVIDER_LOCKED/);
  });

  it('geolocation only ever receives the Express-derived client IP (no raw XFF parsing)', () => {
    const geo = fs.readFileSync(path.resolve(process.cwd(), 'src/services/billing/ipGeoService.ts'), 'utf8');
    assert.doesNotMatch(geo, /req\.headers/, 'geo service must never read headers itself');
    assert.doesNotMatch(geo, /['"`]x-forwarded-for['"`]/i, 'no XFF string handling in code');
    const controller2 = fs.readFileSync(path.resolve(process.cwd(), 'src/controllers/billingController.ts'), 'utf8');
    assert.match(controller2, /resolveBillingContext\(userId, req\.ip\)/);
  });

  it('frontend never sends a provider with checkout and renders the server decision', () => {
    const feService = fs.readFileSync(path.resolve(process.cwd(), '../src/services/billingService.ts'), 'utf8');
    assert.doesNotMatch(feService, /body: JSON\.stringify\(\{ planId, interval, provider \}\)/);
    const page = fs.readFileSync(path.resolve(process.cwd(), '../src/pages/BillingPage.tsx'), 'utf8');
    // The page renders the server's gateway decision (context.provider) and offers no provider choice.
    assert.match(page, /BillingService\.getBillingContext\(\)/);
    assert.match(page, /checkout\.provider === 'razorpay'/);
    assert.match(page, /confirmBillingCountry/);
    assert.doesNotMatch(page, /setSelectedProvider\(prov\.name\)/, 'no provider toggle');
  });
});
