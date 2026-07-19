import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

export interface OtpMail {
  to: string;
  name: string;
  code: string;
  /** How long the code stays valid, in whole minutes. */
  ttlMinutes: number;
  purpose: 'REGISTRATION' | 'LOGIN' | 'PASSWORD_RESET';
}

/** Brand tokens, inlined below — email clients strip <style> blocks and CSS vars. */
const NAVY = '#14346B';
const INK = '#101828';
const MUTED = '#5A6779';
const BORDER = '#E2E7EF';
const CANVAS = '#F5F6F8';

const COPY: Record<
  OtpMail['purpose'],
  { subject: (app: string) => string; heading: string; lead: string; warn: string }
> = {
  REGISTRATION: {
    subject: (app) => `Your ${app} verification code`,
    heading: 'Confirm your email',
    lead: 'Use this code to finish creating your account.',
    warn: "If you didn't sign up, you can ignore this email.",
  },
  LOGIN: {
    subject: (app) => `Your ${app} sign-in code`,
    heading: 'Sign in',
    lead: 'Use this code to sign in.',
    warn: "If you didn't try to sign in, change your password.",
  },
  PASSWORD_RESET: {
    subject: (app) => `Your ${app} password reset code`,
    heading: 'Reset your password',
    lead: 'Use this code to choose a new password.',
    warn: "If you didn't request this, ignore this email — your password is unchanged.",
  },
};

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  /** True once SMTP credentials are present; false keeps the log-only fallback. */
  get enabled(): boolean {
    return !!this.config.get<string>('mail.user') && !!this.config.get<string>('mail.pass');
  }

  onModuleInit() {
    if (!this.enabled) {
      this.logger.warn(
        'SMTP not configured (SMTP_USER / SMTP_PASS unset) — OTP codes will be logged, not emailed.',
      );
      return;
    }

    this.transporter = createTransport({
      host: this.config.get<string>('mail.host'),
      port: this.config.get<number>('mail.port'),
      secure: this.config.get<boolean>('mail.secure'),
      auth: {
        user: this.config.get<string>('mail.user'),
        pass: this.config.get<string>('mail.pass'),
      },
    });

    // Proves host/port/credentials at boot rather than at the first signup.
    this.transporter
      .verify()
      .then(() => this.logger.log(`SMTP ready via ${this.config.get<string>('mail.host')}`))
      .catch((err: Error) =>
        this.logger.error(`SMTP verify failed — mail will not send: ${err.message}`),
      );
  }

  private from(): string {
    const app = this.config.get<string>('mail.appName') ?? 'PitchMatch';
    const explicit = this.config.get<string>('mail.from');
    if (explicit) return explicit;
    // Gmail rewrites the envelope sender to the authenticated account anyway,
    // so default to it rather than risk a mismatch being flagged as spoofing.
    return `"${app}" <${this.config.get<string>('mail.user')}>`;
  }

  /**
   * The single delivery path. Returns false when mail is disabled or the send
   * failed — never throws. Every caller is on a request that has already done
   * its real work (user created, password changed, match recorded), so a mail
   * failure must never turn a successful operation into a 500.
   */
  private async deliver(msg: {
    to: string;
    subject: string;
    text: string;
    html: string;
    kind: string;
  }): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.sendMail({
        from: this.from(),
        to: msg.to,
        replyTo: this.config.get<string>('mail.replyTo') || undefined,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      });
      this.logger.log(`${msg.kind} emailed to ${this.mask(msg.to)}`);
      return true;
    } catch (err) {
      this.logger.error(`${msg.kind} to ${this.mask(msg.to)} failed: ${(err as Error).message}`);
      return false;
    }
  }

  private get app(): string {
    return this.config.get<string>('mail.appName') ?? 'PitchMatch';
  }

  /**
   * Send an OTP. False lets the caller fall back to logging the code, so the
   * operator can still read it out of the server log and "resend" can retry.
   */
  async sendOtp(mail: OtpMail): Promise<boolean> {
    const copy = COPY[mail.purpose];
    return this.deliver({
      to: mail.to,
      subject: copy.subject(this.app),
      text: this.text(mail, copy, this.app),
      html: this.html(mail, copy, this.app),
      kind: `OTP ${mail.purpose}`,
    });
  }

  /** Sent once, when a new account's email is verified. */
  async sendWelcome(to: string, name: string): Promise<boolean> {
    const heading = `Welcome to ${this.app}`;
    const lead = 'Your email is verified and your account is live.';
    const body =
      'Finish your profile so the right people can find you — the more complete it is, the better your matches rank.';
    return this.deliver({
      to,
      subject: `Welcome to ${this.app}`,
      text: this.plain(name, heading, lead, [body], this.app),
      html: this.layout(heading, `Hi ${this.escape(name)}, ${lead}`, `<p style="margin:0;font-size:15px;line-height:23px;color:${MUTED};">${body}</p>`, this.app),
      kind: 'Welcome',
    });
  }

  /**
   * Security notice after a password change. Deliberately sent even when the
   * user made the change themselves — the point is that an unauthorised change
   * is visible to the real owner.
   */
  async sendPasswordChanged(
    to: string,
    name: string,
    opts: { sessionsRevoked: boolean },
  ): Promise<boolean> {
    const heading = 'Your password was changed';
    const when = new Date().toUTCString();
    const lead = `This happened on ${when}.`;
    const lines = [
      opts.sessionsRevoked
        ? 'Every device signed in to your account has been signed out. Sign in again with your new password.'
        : 'You can keep using your other signed-in devices.',
      "If this wasn't you, reset your password immediately — whoever made this change can currently sign in.",
    ];
    return this.deliver({
      to,
      subject: `Your ${this.app} password was changed`,
      text: this.plain(name, heading, lead, lines, this.app),
      html: this.layout(
        heading,
        `Hi ${this.escape(name)}, ${lead}`,
        lines
          .map(
            (l, i) =>
              `<p style="margin:${i ? '12px' : '0'} 0 0 0;font-size:15px;line-height:23px;color:${i === lines.length - 1 ? INK : MUTED};${i === lines.length - 1 ? 'font-weight:600;' : ''}">${l}</p>`,
          )
          .join(''),
        this.app,
      ),
      kind: 'Password changed',
    });
  }

  /** Sent to the person who is not in the app when a mutual match completes. */
  async sendNewMatch(to: string, name: string, otherName: string): Promise<boolean> {
    const heading = "It's a match";
    const safeOther = this.escape(otherName);
    const lead = `You and ${otherName} are both interested.`;
    const body = `Open ${this.app} to view the full profile and start the conversation.`;
    return this.deliver({
      to,
      subject: `You matched with ${this.headerSafe(otherName)} on ${this.app}`,
      text: this.plain(name, heading, lead, [body], this.app),
      html: this.layout(
        heading,
        `Hi ${this.escape(name)}, you and <strong style="color:${INK};">${safeOther}</strong> are both interested.`,
        `<p style="margin:0;font-size:15px;line-height:23px;color:${MUTED};">${body}</p>`,
        this.app,
      ),
      kind: 'New match',
    });
  }

  /** Shared plain-text body. Every HTML mail ships a text alternative. */
  private plain(
    name: string,
    heading: string,
    lead: string,
    lines: string[],
    app: string,
  ): string {
    return [heading, '', `Hi ${name},`, lead, '', ...lines, '', `— ${app}`].join('\n');
  }

  /** Shared HTML shell, so every mail reads as the same product. */
  private layout(heading: string, leadHtml: string, bodyHtml: string, app: string): string {
    return `<!doctype html>
<html>
  <body style="margin:0;padding:24px 0;background:${CANVAS};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border:1px solid ${BORDER};border-radius:14px;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <div style="font-size:17px;font-weight:700;color:${NAVY};letter-spacing:-0.3px;">${app}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0 32px;">
                <div style="font-size:21px;font-weight:700;color:${INK};letter-spacing:-0.3px;">${heading}</div>
                <div style="font-size:15px;line-height:23px;color:${MUTED};padding-top:8px;">${leadHtml}</div>
              </td>
            </tr>
            <tr><td style="padding:22px 32px 30px 32px;">${bodyHtml}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  /** Never log a full address — these lines end up in shared hosting logs. */
  private mask(email: string): string {
    const [user, domain] = email.split('@');
    if (!domain) return '***';
    return `${user.slice(0, 2)}***@${domain}`;
  }

  private text(mail: OtpMail, copy: (typeof COPY)[OtpMail['purpose']], app: string): string {
    return [
      `${copy.heading}`,
      '',
      `Hi ${mail.name},`,
      copy.lead,
      '',
      `Code: ${mail.code}`,
      `This code expires in ${mail.ttlMinutes} minute${mail.ttlMinutes === 1 ? '' : 's'}.`,
      '',
      copy.warn,
      '',
      `— ${app}`,
    ].join('\n');
  }

  private html(mail: OtpMail, copy: (typeof COPY)[OtpMail['purpose']], app: string): string {
    // Table layout with inline styles — the only thing that renders consistently
    // across Gmail, Outlook and Apple Mail.
    return `<!doctype html>
<html>
  <body style="margin:0;padding:24px 0;background:${CANVAS};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border:1px solid ${BORDER};border-radius:14px;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <div style="font-size:17px;font-weight:700;color:${NAVY};letter-spacing:-0.3px;">${app}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0 32px;">
                <div style="font-size:21px;font-weight:700;color:${INK};letter-spacing:-0.3px;">${copy.heading}</div>
                <div style="font-size:15px;line-height:23px;color:${MUTED};padding-top:8px;">
                  Hi ${this.escape(mail.name)}, ${copy.lead}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0 32px;">
                <div style="background:${CANVAS};border:1px solid ${BORDER};border-radius:12px;padding:18px;text-align:center;">
                  <div style="font-size:32px;font-weight:700;color:${INK};letter-spacing:9px;font-family:'SF Mono',Menlo,Consolas,monospace;">${mail.code}</div>
                </div>
                <div style="font-size:13px;color:${MUTED};padding-top:12px;text-align:center;">
                  Expires in ${mail.ttlMinutes} minute${mail.ttlMinutes === 1 ? '' : 's'}.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 30px 32px;">
                <div style="border-top:1px solid ${BORDER};padding-top:16px;font-size:13px;line-height:20px;color:${MUTED};">
                  ${copy.warn}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  /**
   * Names are user-supplied and reach the Subject header. Nodemailer already
   * refuses to emit a header containing CR/LF, but stripping them here means
   * the guarantee is ours rather than a library's, and it keeps a pathological
   * name from producing an absurd subject line.
   */
  private headerSafe(s: string): string {
    return s.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80);
  }

  /** Names are user-supplied and land inside HTML. */
  private escape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
