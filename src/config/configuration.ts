export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_me',
    accessTtl: process.env.JWT_ACCESS_TTL || '900s',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me',
    refreshTtl: process.env.JWT_REFRESH_TTL || '30d',
  },
  otp: {
    ttlSeconds: parseInt(process.env.OTP_TTL_SECONDS || '300', 10),
    length: parseInt(process.env.OTP_LENGTH || '6', 10),
  },
  // Firebase service-account JSON (raw or base64) for FCM HTTP v1. Unset
  // disables push. Never a file path in production -- hosting panels hold this
  // as an env var and the key must not sit on disk.
  push: {
    serviceAccount: process.env.FCM_SERVICE_ACCOUNT || '',
  },
  // Checkout. Prices are minor units (cents/paisa) so no float touches money.
  //
  // ALLOW_DUMMY_PAYMENTS grants credits without anyone paying. It exists for
  // testing the flow end to end and is refused outright when NODE_ENV is
  // production, because a test checkout left on in prod is a free-credits
  // faucet for anyone who can call the API.
  payments: {
    nodeEnv: process.env.NODE_ENV || 'development',
    allowDummy: process.env.ALLOW_DUMMY_PAYMENTS || 'false',
    packs: JSON.parse(
      process.env.CREDIT_PACKS ||
        '[{"productId":"credits_5","credits":5,"priceMinor":499,"currency":"USD"},{"productId":"credits_20","credits":20,"priceMinor":1499,"currency":"USD"},{"productId":"credits_50","credits":50,"priceMinor":2999,"currency":"USD"}]',
    ),
  },
  // Google Play Billing. The pack catalogue lives server-side on purpose:
  // credits granted must never be decided by the client.
  play: {
    serviceAccount: process.env.PLAY_SERVICE_ACCOUNT || '',
    packageName: process.env.PLAY_PACKAGE_NAME || 'com.matchventure.app',
    packs: JSON.parse(
      process.env.PLAY_PACKS ||
        '[{"productId":"credits_5","credits":5},{"productId":"credits_20","credits":20},{"productId":"credits_50","credits":50}]',
    ) as { productId: string; credits: number }[],
  },
  // Plain SMTP on purpose rather than a provider SDK: Gmail now, a branded
  // no-reply@ on the domain later, becomes an env change instead of a code
  // change. With SMTP_USER/SMTP_PASS unset, sending is disabled and the code
  // is logged instead, so local dev needs no mail account.
  mail: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    // 465 is implicit TLS; 587 upgrades via STARTTLS.
    secure: (process.env.SMTP_SECURE || 'true') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || '',
    replyTo: process.env.MAIL_REPLY_TO || '',
    appName: process.env.MAIL_APP_NAME || 'MatchVenture',
  },
});
