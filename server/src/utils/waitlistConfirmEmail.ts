import { signSuppressionToken } from './waitlistMail.js';

// Waitlist confirmation mail template. Copy/design exactly as approved by the
// owner 2026-11-21 21:52 IST ("Sahi hai" on the rendered preview): unambiguous
// waitlist heading, no access/launch/queue promises, single leave link.
// Logo URL is configuration (public host) - no asset is bundled or uploaded here.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const CONFIRM_SUBJECT = "You're on the Vireo waitlist";

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

function leaveUrl(email: string, tokenVersion: number, issuedAt?:number): string {
  const base = (process.env.WAITLIST_PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  const token = signSuppressionToken(email, tokenVersion,issuedAt);
  return `${base}/api/waitlist/leave?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

export function renderConfirmEmail(email: string, tokenVersion: number,issuedAt?:number): RenderedMail {
  const url = leaveUrl(email, tokenVersion,issuedAt);
  const logo = process.env.WAITLIST_LOGO_URL ?? '';
  const text = `You're on the Vireo waitlist

Thanks for signing up. We've saved this email address on the Vireo waitlist, and we'll use it to contact you about your signup.

If this wasn't you, or you change your mind later, this email includes a link to leave the list at any time:
${url}

Vireo`;
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><style>u + .body .gmail-blend-screen{background:#000;mix-blend-mode:screen}u + .body .gmail-blend-difference{background:#000;mix-blend-mode:difference}</style></head><body class="body" bgcolor="#000000" style="margin:0;background:#000000;background-image:linear-gradient(#000000,#000000);">
<div style="max-width:600px;margin:0 auto;padding:40px 28px;font-family:Arial,Helvetica,sans-serif;background:#000000;background-image:linear-gradient(#000000,#000000);color:#f5f5f5;">
  <div style="text-align:center;padding-bottom:24px;">
    ${logo ? `<img src="${logo}" alt="Vireo" width="143" height="36" style="display:block;width:143px;height:36px;max-width:100%;margin:0 auto;border:0;">` : '<span style="font-size:20px;font-weight:700;">Vireo</span>'}
  </div>
  <div class="gmail-blend-screen"><div class="gmail-blend-difference"><h1 style="font-size:22px;font-weight:600;margin:0 0 16px;text-align:center;">You're on the Vireo waitlist</h1></div></div>
  <div class="gmail-blend-screen"><div class="gmail-blend-difference"><p style="font-size:15px;line-height:1.6;color:#d4d4d4;margin:0 0 14px;">Thanks for signing up. We've saved this email address on the Vireo waitlist, and we'll use it to contact you about your signup.</p></div></div>
  <div class="gmail-blend-screen"><div class="gmail-blend-difference"><p style="font-size:15px;line-height:1.6;color:#d4d4d4;margin:0 0 28px;">If this wasn't you, or you change your mind later, this email includes a link to leave the list at any time.</p></div></div>
  <div style="text-align:center;padding:18px 0;border-top:1px solid #7c3aed;">
    <div class="gmail-blend-screen"><div class="gmail-blend-difference"><a href="${url}" style="font-size:13px;color:#a78bfa;text-decoration:underline;">Leave the waitlist</a></div></div>
  </div>
  <div class="gmail-blend-screen"><div class="gmail-blend-difference"><p style="font-size:12px;color:#737373;text-align:center;margin:18px 0 0;">Vireo</p></div></div>
</div>
</body></html>`;
  return { subject: CONFIRM_SUBJECT, text, html };
}

// One-click landing for the mailed link: GET shows a plain confirm page whose
// form POSTs the token as application/x-www-form-urlencoded. Prefetch/scanner
// GETs therefore never suppress, and a real click is a plain HTML form POST -
// NO JavaScript at all, so the page works under the production Helmet CSP
// (script-src 'self', script-src-attr 'none'); inline style attributes are
// allowed by the baseline policy (style-src 'unsafe-inline').
export function leaveConfirmPage(email: string, token: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5;">
<div style="max-width:480px;margin:80px auto;padding:32px;text-align:center;">
  <h1 style="font-size:20px;font-weight:600;">Leave the Vireo waitlist?</h1>
  <p style="font-size:14px;color:#d4d4d4;line-height:1.6;">Confirm below and we'll remove ${esc(email)} from the waitlist.</p>
  <form method="POST" action="/api/waitlist/leave">
    <input type="hidden" name="email" value="${esc(email)}">
    <input type="hidden" name="token" value="${esc(token)}">
    <button type="submit" style="background:#7c3aed;color:#fff;border:0;border-radius:8px;padding:12px 24px;font-size:14px;cursor:pointer;">Leave the waitlist</button>
  </form>
</div>
</body></html>`;
}

// Outcome page for form submissions: the POST handler renders this instead of
// JSON when the request came from the HTML form.
export function leaveResultPage(ok: boolean): string {
  const msg = ok
    ? 'Done. You have left the waitlist.'
    : 'That link did not work. It may have been replaced by a newer email.';
  return `<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5;">
<div style="max-width:480px;margin:80px auto;padding:32px;text-align:center;">
  <p style="font-size:14px;color:#d4d4d4;line-height:1.6;">${msg}</p>
</div>
</body></html>`;
}
