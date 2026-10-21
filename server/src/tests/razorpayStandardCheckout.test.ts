import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Request, Response } from 'express';
import { createOrder, verifyPayment } from '../controllers/paymentController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

const KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_Tq8KrPMJAAHySy';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'ESd5YPiS8X6PbJTgWa53eHst';

// Mock request / response helpers for direct unit testing of controller functions
function createMockReqRes(body: any = {}, headers: any = {}) {
  const req = {
    body,
    headers,
  } as unknown as Request;

  let statusCode = 200;
  let responseData: any = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: any) {
      responseData = data;
      return res;
    },
  } as unknown as Response;

  return {
    req,
    res,
    getStatus: () => statusCode,
    getData: () => responseData,
  };
}

describe('Razorpay Standard Web Checkout Integration', () => {

  describe('1. Environment & Credentials Configuration', () => {
    test('Razorpay test credentials are configured correctly', () => {
      assert.equal(KEY_ID, 'rzp_test_Tq8KrPMJAAHySy', 'KEY_ID should match the provided test key ID');
      assert.equal(KEY_SECRET, 'ESd5YPiS8X6PbJTgWa53eHst', 'KEY_SECRET should match the provided test secret');
    });

    test('.env files and gitignore protect the secret from client leaks', () => {
      const gitignore = fs.readFileSync(path.join(projectRoot, '.gitignore'), 'utf-8');
      assert.match(gitignore, /\.env/, '.gitignore must ignore .env files');

      const rootEnv = fs.readFileSync(path.join(projectRoot, '.env'), 'utf-8');
      assert.match(rootEnv, /RAZORPAY_KEY_ID=rzp_test_Tq8KrPMJAAHySy/);
      assert.match(rootEnv, /RAZORPAY_KEY_SECRET=ESd5YPiS8X6PbJTgWa53eHst/);
      assert.match(rootEnv, /VITE_RAZORPAY_KEY_ID=rzp_test_Tq8KrPMJAAHySy/);

      // Verify that KEY_SECRET is never prefixed with VITE_
      assert.doesNotMatch(rootEnv, /VITE_.*SECRET/, 'Secret must never have VITE_ prefix');
    });
  });

  describe('2. Step 1: POST /api/create-order Controller', () => {
    test('Rejects orders with amount less than 100 paise (min 100 paise)', async () => {
      const { req, res, getStatus, getData } = createMockReqRes({
        amount: 50, // 50 paise is below 100 paise minimum
        currency: 'INR',
      });

      await createOrder(req, res);

      assert.equal(getStatus(), 400, 'Must return 400 for amount < 100 paise');
      const data = getData();
      assert.equal(data.code, 'INVALID_AMOUNT');
      assert.match(data.message, /minimum.*100 paise/i);
    });

    test('Rejects orders with non-numeric or missing amount', async () => {
      const { req, res, getStatus, getData } = createMockReqRes({
        amount: 'invalid_amount',
      });

      await createOrder(req, res);

      assert.equal(getStatus(), 400);
      assert.equal(getData().code, 'INVALID_AMOUNT');
    });

    test('Creates a real Razorpay test order with credentials (amount >= 100 paise)', async () => {
      const { req, res, getStatus, getData } = createMockReqRes({
        amount: 500, // ₹5 in paise
        currency: 'INR',
        receipt: `test_receipt_${Date.now()}`,
        notes: {
          test: 'true',
          purpose: 'standard_checkout_unit_test',
        },
      });

      await createOrder(req, res);

      assert.equal(getStatus(), 200, `Expected 200 OK from Razorpay, got: ${JSON.stringify(getData())}`);
      const data = getData();
      assert.equal(data.success, true);
      assert.ok(data.order_id, 'Must return order_id');
      assert.ok(data.order_id.startsWith('order_'), 'order_id must start with order_ prefix');
      assert.equal(data.amount, 500);
      assert.equal(data.currency, 'INR');
      assert.equal(data.key_id, KEY_ID);
    });
  });

  describe('3. Step 3: POST /api/verify-payment Controller (HMAC-SHA256)', () => {
    test('Rejects verification when required fields are missing', async () => {
      const { req, res, getStatus, getData } = createMockReqRes({
        order_id: 'order_test_123',
        // missing payment_id and signature
      });

      await verifyPayment(req, res);

      assert.equal(getStatus(), 400);
      assert.equal(getData().code, 'MISSING_FIELDS');
    });

    test('Rejects verification when signature does not match (forged signature)', async () => {
      const { req, res, getStatus, getData } = createMockReqRes({
        order_id: 'order_1234567890',
        payment_id: 'pay_9876543210',
        signature: 'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
      });

      await verifyPayment(req, res);

      assert.equal(getStatus(), 400, 'Must return 400 when signature mismatches');
      const data = getData();
      assert.equal(data.code, 'SIGNATURE_MISMATCH');
      assert.equal(data.success, false);
      assert.match(data.message, /signature mismatch/i);
    });

    test('Accepts verification when HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET) matches', async () => {
      const testOrderId = 'order_M12345test678';
      const testPaymentId = 'pay_P98765test432';

      // Compute correct signature according to Razorpay specification
      const expectedPayload = `${testOrderId}|${testPaymentId}`;
      const validSignature = crypto
        .createHmac('sha256', KEY_SECRET)
        .update(expectedPayload)
        .digest('hex');

      const { req, res, getStatus, getData } = createMockReqRes({
        razorpay_order_id: testOrderId,
        razorpay_payment_id: testPaymentId,
        razorpay_signature: validSignature,
      });

      await verifyPayment(req, res);

      assert.equal(getStatus(), 200, 'Must return 200 for valid matching signature');
      const data = getData();
      assert.equal(data.success, true);
      assert.equal(data.order_id, testOrderId);
      assert.equal(data.payment_id, testPaymentId);
      assert.match(data.message, /verified successfully/i);
    });
  });

  describe('4. Step 2 & Frontend Standard Checkout Verification', () => {
    test('index.html contains the Razorpay checkout.js script tag', () => {
      const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf-8');
      assert.match(
        indexHtml,
        /<script src="https:\/\/checkout\.razorpay\.com\/v1\/checkout\.js"><\/script>/,
        'index.html must include the official Razorpay checkout script'
      );
    });

    test('src/services/razorpayService.ts provides createRazorpayOrder, verifyRazorpayPayment, and openRazorpayCheckout', () => {
      const serviceFile = fs.readFileSync(path.join(projectRoot, 'src/services/razorpayService.ts'), 'utf-8');
      assert.match(serviceFile, /export async function createRazorpayOrder/);
      assert.match(serviceFile, /export async function verifyRazorpayPayment/);
      assert.match(serviceFile, /export async function openRazorpayCheckout/);
      assert.match(serviceFile, /\/create-order/);
      assert.match(serviceFile, /\/verify-payment/);
    });

    test('src/components/RazorpayCheckoutButton.tsx exists and is exported', () => {
      const componentFile = fs.readFileSync(path.join(projectRoot, 'src/components/RazorpayCheckoutButton.tsx'), 'utf-8');
      assert.match(componentFile, /export const RazorpayCheckoutButton/);
      assert.match(componentFile, /openRazorpayCheckout/);
    });

    test('src/pages/BillingPage.tsx integrates Razorpay Standard Checkout and test buttons', () => {
      const billingPage = fs.readFileSync(path.join(projectRoot, 'src/pages/BillingPage.tsx'), 'utf-8');
      assert.match(billingPage, /openRazorpayCheckout/);
      assert.match(billingPage, /RazorpayCheckoutButton/);
      assert.match(billingPage, /Razorpay Standard Web Checkout/);
    });
  });

  describe('5. Express Route Registration', () => {
    test('server/src/routes/paymentRoutes.ts defines /create-order and /verify-payment', () => {
      const routesFile = fs.readFileSync(path.join(projectRoot, 'server/src/routes/paymentRoutes.ts'), 'utf-8');
      assert.match(routesFile, /router\.post\('\/create-order'/);
      assert.match(routesFile, /router\.post\('\/verify-payment'/);
    });

    test('server/src/routes/index.ts mounts paymentRoutes', () => {
      const indexRoutes = fs.readFileSync(path.join(projectRoot, 'server/src/routes/index.ts'), 'utf-8');
      assert.match(indexRoutes, /import paymentRoutes from '\.\/paymentRoutes\.js'/);
      assert.match(indexRoutes, /apiRouter\.use\('\/', paymentRoutes\)/);
    });
  });

});
