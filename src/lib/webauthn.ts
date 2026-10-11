export const RP_NAME = "Budget Tracker";

export function rpConfig() {
  const rpID =
    process.env.WEBAUTHN_RP_ID ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    (process.env.VERCEL_URL ? process.env.VERCEL_URL.replace(/:\d+$/, "") : undefined) ||
    "localhost";

  const origin =
    process.env.WEBAUTHN_ORIGIN ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    "http://localhost:3000";

  return { rpID, origin };
}

