import test from 'node:test';
import assert from 'node:assert/strict';
import { UrlValidator } from '../utils/urlValidator.js';

const blocked = [
  '::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:7f00:1',
  '0000:0000:0000:0000:0000:FFFF:7F00:0001',
  '::ffff:10.0.0.1', '::ffff:a00:1',
  '::ffff:172.16.0.1', '::ffff:ac10:1',
  '::ffff:192.168.0.1', '::ffff:c0a8:1',
  '::ffff:169.254.169.254', '::ffff:a9fe:a9fe',
  '0:0:0:0:0:ffff:169.254.169.254',
  '::ffff:100.64.0.1', '::ffff:6440:1',
  '::ffff:0.0.0.0', '::ffff:0:0',
];
for (const ip of blocked) {
  test(`mapped IPv6 private target is rejected: ${ip}`, async () => {
    assert.equal(UrlValidator.isPrivateIp(ip), true);
    // Direct-IP path rejects before DNS. This test makes no network request.
    await assert.rejects(UrlValidator.checkSsrf(ip), (error: any) => error.code === 'SSRF_BLOCKED');
  });
}
for (const ip of ['::ffff:8.8.8.8', '::ffff:808:808', '0:0:0:0:0:ffff:808:808', '2606:4700:4700::1111']) {
  test(`public address is not mistaken for private: ${ip}`, () => {
    assert.equal(UrlValidator.isPrivateIp(ip), false);
  });
}
test('native IPv6 private and loopback protections remain', () => {
  for (const ip of ['::1', '0:0:0:0:0:0:0:1', '::', 'fe80::1', 'fc00::1', 'fd00::1']) {
    assert.equal(UrlValidator.isPrivateIp(ip), true, ip);
  }
});
