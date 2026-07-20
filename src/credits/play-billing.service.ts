import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWT } from 'google-auth-library';

/**
 * Google Play purchase verification.
 *
 * The client sends only a purchaseToken. Everything that matters — that the
 * purchase exists, is for this app, is in the PURCHASED state, and has not
 * already been consumed — is established by asking Google, never by trusting
 * what the app said it bought. A client that claims `credits_100` gets whatever
 * Google says the token is actually for.
 *
 * Fails CLOSED: with no service account configured, every purchase is rejected.
 * The alternative (granting unverified credits in dev) is the kind of default
 * that eventually ships.
 */

export type VerifyResult =
  | { ok: true; productId: string; orderId?: string; raw: unknown }
  | { ok: false; reason: string };

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

/** Google's purchaseState for a one-time product. */
const PURCHASED = 0;

@Injectable()
export class PlayBillingService implements OnModuleInit {
  private readonly logger = new Logger(PlayBillingService.name);
  private jwt: JWT | null = null;
  private packageName = '';

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return !!this.jwt;
  }

  onModuleInit() {
    const raw = this.config.get<string>('play.serviceAccount');
    this.packageName = this.config.get<string>('play.packageName') ?? '';

    if (!raw) {
      this.logger.warn(
        'PLAY_SERVICE_ACCOUNT unset — purchases will be rejected. Set it to enable billing.',
      );
      return;
    }

    try {
      // Accept raw JSON or base64, same as FCM: hosting panels mangle the
      // newlines in a private key.
      const json = raw.trim().startsWith('{')
        ? raw
        : Buffer.from(raw, 'base64').toString('utf8');
      const creds = JSON.parse(json) as { client_email: string; private_key: string };

      this.jwt = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: [SCOPE],
      });
      this.logger.log(`Play Billing ready for ${this.packageName}`);
    } catch (err) {
      this.logger.error(
        `PLAY_SERVICE_ACCOUNT is not valid JSON or base64 JSON: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Confirm a one-time product purchase with Google.
   *
   * Note the productId comes back from Google's URL path, so the caller should
   * price from the returned value rather than the one the client supplied.
   */
  async verifyProduct(productId: string, purchaseToken: string): Promise<VerifyResult> {
    if (!this.jwt) return { ok: false, reason: 'Billing is not configured on the server' };
    if (!this.packageName) return { ok: false, reason: 'PLAY_PACKAGE_NAME is not set' };

    try {
      const { token } = await this.jwt.getAccessToken();
      const url = `${API}/applications/${this.packageName}/purchases/products/${encodeURIComponent(
        productId,
      )}/tokens/${encodeURIComponent(purchaseToken)}`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      if (!res.ok) {
        const text = await res.text();
        // 404 is the common, meaningful one: wrong product, wrong package, or a
        // token that was never real.
        this.logger.warn(`Play verify ${res.status}: ${text.slice(0, 300)}`);
        return {
          ok: false,
          reason:
            res.status === 404
              ? 'Google does not recognise this purchase'
              : `Google rejected the check (${res.status})`,
        };
      }

      const body = (await res.json()) as {
        purchaseState?: number;
        consumptionState?: number;
        orderId?: string;
      };

      if (body.purchaseState !== PURCHASED) {
        return {
          ok: false,
          reason:
            body.purchaseState === 2
              ? 'Payment is still pending'
              : 'This purchase was cancelled or refunded',
        };
      }

      return { ok: true, productId, orderId: body.orderId, raw: body };
    } catch (err) {
      this.logger.error(`Play verify threw: ${(err as Error).message}`);
      return { ok: false, reason: 'Could not reach Google to verify the purchase' };
    }
  }

  /**
   * Mark the product consumed with Google so it can be bought again.
   *
   * Deliberately after our own grant has committed: consuming first and then
   * failing to grant would take the user's money and leave them nothing, which
   * is the worse of the two failure directions. Consuming twice is harmless.
   */
  async consume(productId: string, purchaseToken: string): Promise<boolean> {
    if (!this.jwt || !this.packageName) return false;
    try {
      const { token } = await this.jwt.getAccessToken();
      const res = await fetch(
        `${API}/applications/${this.packageName}/purchases/products/${encodeURIComponent(
          productId,
        )}/tokens/${encodeURIComponent(purchaseToken)}:consume`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        this.logger.warn(`Play consume failed (${res.status}) for ${productId}`);
      }
      return res.ok;
    } catch (err) {
      this.logger.error(`Play consume threw: ${(err as Error).message}`);
      return false;
    }
  }
}
