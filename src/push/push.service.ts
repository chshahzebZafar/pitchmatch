import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWT } from 'google-auth-library';
import { Platform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** FCM errors that mean the token is dead and should be deleted, not retried. */
const DEAD_TOKEN = /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i;

export interface PushMessage {
  title: string;
  body: string;
  /** Delivered to the app as strings; used for deep-linking on tap. */
  data?: Record<string, string>;
}

/**
 * Push over FCM HTTP v1, talking to Google directly.
 *
 * Deliberately not `firebase-admin` (~50MB, and it pulls in far more than
 * messaging) and deliberately not Expo's push service, which would route every
 * notification through a third party. This keeps Google as pure transport.
 *
 * Credentials come from the Firebase service-account JSON, supplied as
 * FCM_SERVICE_ACCOUNT (raw JSON or base64). Unset disables push entirely.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private jwt: JWT | null = null;
  private projectId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  get enabled(): boolean {
    return !!this.jwt && !!this.projectId;
  }

  onModuleInit() {
    const raw = this.config.get<string>('push.serviceAccount');
    if (!raw) {
      this.logger.warn('FCM_SERVICE_ACCOUNT unset — push notifications are disabled.');
      return;
    }

    let creds: { client_email?: string; private_key?: string; project_id?: string };
    try {
      // Accept base64 too: hosting panels mangle multi-line values, and the
      // private key is full of newlines.
      const json = raw.trim().startsWith('{')
        ? raw
        : Buffer.from(raw, 'base64').toString('utf8');
      creds = JSON.parse(json);
    } catch {
      this.logger.error('FCM_SERVICE_ACCOUNT is not valid JSON or base64 JSON — push disabled.');
      return;
    }

    if (!creds.client_email || !creds.private_key || !creds.project_id) {
      this.logger.error('FCM_SERVICE_ACCOUNT missing client_email/private_key/project_id.');
      return;
    }

    this.projectId = creds.project_id;
    this.jwt = new JWT({
      email: creds.client_email,
      // Panels commonly store the key with literal \n rather than real newlines.
      key: creds.private_key.replace(/\\n/g, '\n'),
      scopes: [FCM_SCOPE],
    });

    this.logger.log(`FCM ready for project ${this.projectId}`);
  }

  /** Upsert a device token. Reassigns the row if the device changed hands. */
  async registerToken(userId: string, token: string, platform: Platform) {
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
    return { ok: true };
  }

  async removeToken(userId: string, token: string) {
    await this.prisma.pushToken.deleteMany({ where: { token, userId } });
    return { ok: true };
  }

  /**
   * Send to every device a user has. Never throws: callers are on requests that
   * have already done their real work, exactly as with mail.
   */
  async sendToUser(userId: string, msg: PushMessage): Promise<number> {
    if (!this.enabled) return 0;

    const devices = await this.prisma.pushToken.findMany({ where: { userId } });
    if (!devices.length) return 0;

    let sent = 0;
    const dead: string[] = [];

    for (const d of devices) {
      const result = await this.sendToToken(d.token, msg);
      if (result === 'ok') sent++;
      else if (result === 'dead') dead.push(d.token);
    }

    // A token stays dead forever once FCM rejects it; keeping it means retrying
    // a guaranteed failure on every future notification.
    if (dead.length) {
      await this.prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
      this.logger.log(`Pruned ${dead.length} dead push token(s) for user=${userId}`);
    }

    return sent;
  }

  private async sendToToken(
    token: string,
    msg: PushMessage,
  ): Promise<'ok' | 'dead' | 'failed'> {
    try {
      const { token: accessToken } = await this.jwt!.getAccessToken();
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: msg.title, body: msg.body },
              data: msg.data ?? {},
              android: {
                priority: 'HIGH',
                notification: { channelId: 'default' },
              },
            },
          }),
        },
      );

      if (res.ok) return 'ok';

      const text = await res.text();
      if (res.status === 404 || res.status === 400 || DEAD_TOKEN.test(text)) {
        return 'dead';
      }
      this.logger.error(`FCM send failed (${res.status}): ${text.slice(0, 300)}`);
      return 'failed';
    } catch (err) {
      this.logger.error(`FCM send threw: ${(err as Error).message}`);
      return 'failed';
    }
  }
}
