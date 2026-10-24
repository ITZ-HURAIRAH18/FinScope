import nodemailer from 'nodemailer';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Email delivery + templates for FinScope auth flows.
 *
 * Template design:
 * - One shared `renderEmail()` shell (preheader, branded header, content,
 *   footer) so every message looks consistent and professional.
 * - Table-based layout + inline styles: the subset of CSS that actually
 *   survives Outlook/Gmail/Apple Mail (no flex/grid/`background-clip`).
 * - Light card on a soft grey canvas — renders identically in light and dark
 *   mail clients (a full-dark gradient looks broken in Outlook's light UI).
 * - Every send includes a plain-text `text` alternative for clients/AT that
 *   refuse HTML.
 * - All user-derived values (names, addresses) are HTML-escaped (audit:
 *   "Email HTML injection: raw `name` interpolated into outbound HTML").
 *
 * SMTP configuration: `SMTP_*` names are preferred (documented in README);
 * legacy `EMAIL_*` names still work as a fallback so existing `.env` files
 * keep working.
 */

const smtpHost = process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com';
const smtpPort = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587', 10);
const smtpSecure = smtpPort === 465;
const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  // Audit: `secure:false` without forcing STARTTLS would allow cleartext
  // fallback. Require TLS on non-465 ports so credentials/code never travel
  // unencrypted.
  ...(smtpSecure ? {} : { requireTLS: true }),
  auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
});

/** Sender identity: `EMAIL_FROM` wins, else a name paired with the SMTP user. */
function fromAddress(): string {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  if (process.env.SMTP_FROM) return process.env.SMTP_FROM;
  return smtpUser ? `FinScope <${smtpUser}>` : 'FinScope';
}

/** Escape user-derived strings before interpolation into HTML templates. */
function esc(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate a 6-digit OTP using the CSPRNG (docs/AUDIT-REPORT.md S3).
 * `crypto.randomInt` is uniform over [min, max) — no modulo bias — unlike the
 * previous `Math.random()` implementation which was predictable.
 */
export function generateOTP(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/** bcrypt cost for OTP hashes. OTPs are short-lived (10 min) single-purpose
 *  secrets; cost 10 keeps verify latency ~50ms while making offline cracking
 *  of a leaked DB row expensive. */
const OTP_HASH_COST = 10;

/** Hash an OTP for storage (H2: never store the OTP in plaintext). */
export function hashOTP(otp: string): Promise<string> {
  return bcrypt.hash(otp, OTP_HASH_COST);
}

/** Constant-work comparison of an OTP against its stored bcrypt hash. */
export function verifyOTPHash(otp: string, storedHash: string): Promise<boolean> {
  return bcrypt.compare(otp, storedHash);
}

// ---------------------------------------------------------------------------
// Shared template shell
// ---------------------------------------------------------------------------

interface EmailShell {
  /** Hidden inbox preview line — shown by most clients after the subject. */
  preheader: string;
  /** Large heading inside the card. */
  heading: string;
  /** Raw (already-escaped) HTML for the card body. */
  bodyHtml: string;
}

/**
 * Professional FinScope email shell.
 *
 * Structure: soft canvas → 600px white card → brand header (gradient accent
 * bar + logo + wordmark) → heading → content → divider → footer with the
 * "why am I receiving this" line. All styles are inline for client support.
 */
function renderEmail({ preheader, heading, bodyHtml }: EmailShell): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>FinScope</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <!-- Preheader: invisible preview text -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;" aria-hidden="true">${esc(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

          <!-- Brand header -->
          <tr>
            <td style="padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:4px;background:linear-gradient(90deg,#DC2626 0%,#EC4899 100%);font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px 8px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="36" height="36" style="width:36px;height:36px;background-color:#FDF2F8;border:1px solid #FBCFE8;border-radius:8px;text-align:center;vertical-align:middle;font-size:18px;font-weight:700;color:#DB2777;line-height:36px;">F</td>
                  <td style="padding-left:10px;font-size:19px;font-weight:700;color:#111827;letter-spacing:-0.3px;vertical-align:middle;">FinScope</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:16px 40px 8px 40px;">
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#111827;">${esc(heading)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 40px 32px 40px;font-size:15px;line-height:1.6;color:#374151;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:0 40px 32px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-top:1px solid #F3F4F6;padding-top:16px;font-size:12px;line-height:1.6;color:#9CA3AF;">
                    You received this email because a request was made for your FinScope account. If this wasn't you, you can safely ignore it — no changes have been made.
                    <br><br>
                    © 2026 FinScope · Real-time crypto &amp; stock analytics
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Big monospaced code block used by OTP emails. */
function otpBlock(otp: string, validFor: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td align="center" style="background-color:#F9FAFB;border:1px dashed #F9A8D4;border-radius:10px;padding:24px 16px;">
        <div style="font-size:13px;color:#6B7280;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:10px;">Your verification code</div>
        <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:40px;font-weight:700;color:#111827;letter-spacing:10px;padding-left:10px;">${esc(otp)}</div>
        <div style="font-size:13px;color:#9CA3AF;margin-top:12px;">Valid for ${esc(validFor)}</div>
      </td>
    </tr>
  </table>`;
}

/** Security callout box. */
function securityNote(text: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
    <tr>
      <td style="background-color:#FEF2F2;border-left:3px solid #EF4444;border-radius:6px;padding:12px 16px;font-size:13px;line-height:1.5;color:#991B1B;">
        ${esc(text)}
      </td>
    </tr>
  </table>`;
}

/** Primary CTA button (bulletproof padding technique). */
function ctaButton(href: string, label: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td align="center" style="background:linear-gradient(90deg,#DC2626,#EC4899);border-radius:8px;">
        <a href="${esc(href)}" style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(label)}</a>
      </td>
    </tr>
  </table>`;
}

/** Plain-text alternative paired with every HTML send. */
function textBody(lines: string[]): string {
  return lines.join('\n\n');
}

/** Common send wrapper: one error path, consistent logging. */
async function send(to: string, subject: string, html: string, text: string) {
  try {
    await transporter.sendMail({ from: fromAddress(), to, subject, html, text });
    return { success: true as const };
  } catch (error) {
    console.error(`[Email] Failed to send "${subject}" to ${to}:`, error);
    return { success: false as const, error };
  }
}

const APP_URL = (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** Account verification OTP (registration / resend). */
export async function sendOTPEmail(email: string, name: string | null, otp: string) {
  const html = renderEmail({
    preheader: `Your FinScope verification code is ${otp} — valid for 10 minutes.`,
    heading: 'Verify your email address',
    bodyHtml: `
      <p style="margin:0 0 4px 0;">Hi ${esc(name) || 'there'},</p>
      <p style="margin:0;">Welcome to FinScope! Enter the code below to verify your email and activate your account.</p>
      ${otpBlock(otp, '10 minutes')}
      ${securityNote('Never share this code with anyone. FinScope staff will never ask for it.')}
    `,
  });
  const text = textBody([
    'Verify your email address',
    `Hi ${name || 'there'}, your FinScope verification code is: ${otp}`,
    'It is valid for 10 minutes.',
    'Never share this code with anyone — FinScope will never ask for it.',
    "If you didn't create this account, you can safely ignore this email.",
  ]);
  return send(email, `Your FinScope verification code: ${otp}`, html, text);
}

/** Password-reset OTP (forgot-password flow). */
export async function sendPasswordResetEmail(email: string, name: string | null, otp: string) {
  const html = renderEmail({
    preheader: `Your FinScope password reset code is ${otp} — valid for 10 minutes.`,
    heading: 'Reset your password',
    bodyHtml: `
      <p style="margin:0 0 4px 0;">Hi ${esc(name) || 'there'},</p>
      <p style="margin:0;">We received a request to reset the password for your FinScope account. Use the code below to choose a new one:</p>
      ${otpBlock(otp, '10 minutes')}
      ${securityNote("Didn't request this? Ignore this email — your password stays unchanged. If this keeps happening, review your account's sign-in activity.")}
      <p style="margin:8px 0 0 0;font-size:13px;color:#6B7280;">For your security, this code can be used only once and expires after 10 minutes.</p>
    `,
  });
  const text = textBody([
    'Reset your password',
    `Hi ${name || 'there'}, your FinScope password reset code is: ${otp}`,
    'It is valid for 10 minutes and can be used only once.',
    "Didn't request this? Your password stays unchanged — ignore this email.",
  ]);
  return send(email, `Your FinScope password reset code: ${otp}`, html, text);
}

/** Security notification sent AFTER a successful password change. */
export async function sendPasswordChangedEmail(email: string, name: string | null) {
  const html = renderEmail({
    preheader: 'Your FinScope password was just changed.',
    heading: 'Your password was changed',
    bodyHtml: `
      <p style="margin:0 0 4px 0;">Hi ${esc(name) || 'there'},</p>
      <p style="margin:0;">The password for your FinScope account was just changed. The new password is active immediately on all devices.</p>
      <p style="margin:16px 0 0 0;font-size:14px;color:#6B7280;">If this was you, no further action is needed.</p>
      ${securityNote("If you didn't change your password, someone else may have access to your account. Reset your password immediately and review your profile settings.")}
      ${ctaButton(`${APP_URL}/auth/forgot-password`, 'Reset password now')}
    `,
  });
  const text = textBody([
    'Your password was changed',
    `Hi ${name || 'there'}, the password for your FinScope account was just changed.`,
    "If this wasn't you, reset your password immediately: " + `${APP_URL}/auth/forgot-password`,
  ]);
  return send(email, 'Your FinScope password was changed', html, text);
}

/** Welcome email after verification. */
export async function sendWelcomeEmail(email: string, name: string | null) {
  const html = renderEmail({
    preheader: 'Your FinScope account is ready — start tracking the markets.',
    heading: 'Welcome to FinScope!',
    bodyHtml: `
      <p style="margin:0 0 4px 0;">Hi ${esc(name) || 'there'},</p>
      <p style="margin:0;">Your email has been verified and your account is ready. Here's what you can do right away:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px;color:#374151;">
        <tr><td style="padding:5px 0;">&#9679;&nbsp; Real-time crypto &amp; stock prices</td></tr>
        <tr><td style="padding:5px 0;">&#9679;&nbsp; Interactive charts with technical indicators</td></tr>
        <tr><td style="padding:5px 0;">&#9679;&nbsp; Personal watchlists &amp; portfolio tracking</td></tr>
        <tr><td style="padding:5px 0;">&#9679;&nbsp; $100,000 virtual balance for paper trading</td></tr>
        <tr><td style="padding:5px 0;">&#9679;&nbsp; Market news &amp; sentiment</td></tr>
      </table>
      ${ctaButton(`${APP_URL}/dashboard`, 'Open your dashboard')}
    `,
  });
  const text = textBody([
    'Welcome to FinScope!',
    'Your email has been verified and your account is ready.',
    'Open your dashboard: ' + `${APP_URL}/dashboard`,
  ]);
  return send(email, 'Welcome to FinScope — your account is ready', html, text);
}

/**
 * Sent when someone registers with an email that already has an account
 * (docs/AUDIT-REPORT.md H3). The API responds with a uniform message so
 * strangers can't enumerate registered emails; only the mailbox owner ever
 * learns that the account exists.
 */
export async function sendAccountExistsEmail(
  email: string,
  name: string | null,
  verified: boolean
) {
  const html = renderEmail({
    preheader: 'You already have a FinScope account — sign in to continue.',
    heading: 'You already have an account',
    bodyHtml: `
      <p style="margin:0 0 4px 0;">Hi ${esc(name) || 'there'},</p>
      <p style="margin:0;">Someone (hopefully you) tried to register a FinScope account with this email address, but an account already exists.</p>
      ${
        verified
          ? `<p style="margin:16px 0 0 0;">Your email is already verified — just sign in with your usual password.</p>`
          : `<p style="margin:16px 0 0 0;">Your account is still waiting for email verification. Open the verification page and request a new code to finish signing up.</p>`
      }
      ${ctaButton(`${APP_URL}/auth/login`, 'Sign in')}
    `,
  });
  const text = textBody([
    'You already have a FinScope account',
    verified
      ? 'Your email is already verified — sign in with your usual password.'
      : 'Your account is still awaiting email verification — request a new code to finish signing up.',
    'Sign in: ' + `${APP_URL}/auth/login`,
    "If you didn't attempt this registration, you can safely ignore this email — no changes were made.",
  ]);
  return send(email, 'You already have a FinScope account', html, text);
}
