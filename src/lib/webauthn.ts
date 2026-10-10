export const RP_NAME = "Budget Tracker";

export function rpConfig() {
  const rpID = process.env.WEBAUTHN_RP_ID;
  const origin = process.env.WEBAUTHN_ORIGIN;
  if (!rpID || !origin) throw new Error("WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN must be set");
  return { rpID, origin };
}
