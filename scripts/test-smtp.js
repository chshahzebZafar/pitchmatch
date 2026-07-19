#!/usr/bin/env node
/**
 * Standalone SMTP smoke test.
 *
 * Run this on the Hostinger box BEFORE relying on OTP email. Managed shared
 * hosting often blocks outbound SMTP (25/465/587), and the failure otherwise
 * only shows up when a real user tries to sign up.
 *
 * NOTE: the Hostinger deploy strips everything except dist/, node_modules/ and
 * package.json, so this file is NOT present in the runtime dir. To use it there
 * you must paste it up manually (heredoc into ~/test-smtp.js).
 *
 * You usually don't need to. The app calls transporter.verify() at boot and
 * logs the outcome, so after setting the env vars in hPanel and restarting:
 *
 *     tail -40 ~/domains/<domain>/nodejs/console.log
 *
 * gives the same answer -- and reads the env vars hPanel injects into the app
 * process, which an SSH shell does not have. Reach for this script only when
 * you need to test credentials that are not yet configured on the app, in which
 * case pass them inline:
 *
 *     SMTP_USER=... SMTP_PASS=... node ~/test-smtp.js you@example.com
 *
 * Plain JS with no imports from the app, so it runs anywhere nodemailer is
 * resolvable.
 */
const nodemailer = require('nodemailer');

const to = process.argv[2];
if (!to) {
  console.error('Usage: node scripts/test-smtp.js <recipient@example.com>');
  process.exit(1);
}

const cfg = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: (process.env.SMTP_SECURE || 'true') === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.MAIL_FROM || '',
};

if (!cfg.user || !cfg.pass) {
  console.error('FAIL: SMTP_USER / SMTP_PASS are not set in this environment.');
  console.error('      Set them in hPanel -> Node.js app -> Environment variables.');
  process.exit(1);
}

console.log(`host=${cfg.host} port=${cfg.port} secure=${cfg.secure} user=${cfg.user}`);

const transporter = nodemailer.createTransport({
  host: cfg.host,
  port: cfg.port,
  secure: cfg.secure,
  auth: { user: cfg.user, pass: cfg.pass },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
});

(async () => {
  try {
    await transporter.verify();
    console.log('OK  : connected and authenticated');
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    // The three failures that actually happen here, and what each means.
    if (/timeout|ETIMEDOUT|ECONNREFUSED/i.test(err.message)) {
      console.error('      Outbound SMTP looks blocked by the host.');
      console.error('      Try SMTP_PORT=587 with SMTP_SECURE=false; if that also');
      console.error('      times out, ask Hostinger to open outbound SMTP, or use');
      console.error("      the domain's own mail server instead of Gmail.");
    } else if (/Invalid login|Username and Password not accepted|BadCredentials/i.test(err.message)) {
      console.error('      Credentials rejected. Gmail requires 2-Step Verification');
      console.error('      plus a 16-character App Password — your normal account');
      console.error('      password will always be refused here.');
    }
    process.exit(1);
  }

  try {
    const info = await transporter.sendMail({
      from: cfg.from || `"PitchMatch" <${cfg.user}>`,
      to,
      subject: 'PitchMatch SMTP test',
      text: 'If you are reading this, OTP email will work from this server.',
    });
    console.log(`OK  : sent, messageId=${info.messageId}`);
    console.log('Check the inbox — and the spam folder.');
  } catch (err) {
    console.error(`FAIL: send rejected: ${err.message}`);
    process.exit(1);
  }
})();
