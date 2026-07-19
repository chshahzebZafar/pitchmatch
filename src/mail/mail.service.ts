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
   * Send an OTP. Returns false when mail is disabled or the send failed, so the
   * caller can fall back to logging rather than failing the request — a signup
   * that already created the user must not 500 because SMTP was down; the code
   * stays valid and "resend" retries.
   */
  async sendOtp(mail: OtpMail): Promise<boolean> {
    if (!this.transporter) return false;

    const app = this.config.get<string>('mail.appName') ?? 'PitchMatch';
    const copy = COPY[mail.purpose];
    const replyTo = this.config.get<string>('mail.replyTo') || undefined;

    try {
      await this.transporter.sendMail({
        from: this.from(),
        to: mail.to,
        replyTo,
        subject: copy.subject(app),
        text: this.text(mail, copy, app),
        html: this.html(mail, copy, app),
      });
      this.logger.log(`OTP ${mail.purpose} emailed to ${this.mask(mail.to)}`);
      return true;
    } catch (err) {
      this.logger.error(
        `OTP ${mail.purpose} to ${this.mask(mail.to)} failed: ${(err as Error).message}`,
      );
      return false;
    }
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

  /** Names are user-supplied and land inside HTML. */
  private escape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
