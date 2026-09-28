import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "crypto";

const accessSecret = process.env.JWT_ACCESS_SECRET ?? "dev-access-secret";
const refreshSecret = process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret";
const accessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN ?? "15m";
const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN ?? "7d";

export interface TokenPayload {
  sub: string;
  email: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, accessSecret, { expiresIn: accessExpiresIn as SignOptions["expiresIn"] });
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, refreshSecret, { expiresIn: refreshExpiresIn as SignOptions["expiresIn"] });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, accessSecret) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, refreshSecret) as TokenPayload;
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function getRefreshTokenExpiry(): Date {
  const match = refreshExpiresIn.match(/^(\d+)([dhms])$/);
  if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return new Date(Date.now() + value * multipliers[unit]);
}

type SupabaseSigningKey = { key: crypto.KeyObject; kid: string; algorithm: "ES256" | "RS256" };

/**
 * SUPABASE_JWT_SIGNING_KEY holds the private JWK (ES256 or RS256) imported into the Supabase
 * project's JWT signing keys; Supabase verifies our tokens with the matching public key. Accepts a
 * single JWK or the array format of `supabase gen signing-key` / signing_keys.json.
 */
function loadSupabaseSigningKey(): SupabaseSigningKey | null {
  const raw = process.env.SUPABASE_JWT_SIGNING_KEY;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const jwk = Array.isArray(parsed) ? parsed.find((k) => k?.d) : parsed;
    if (!jwk?.d || !jwk.kid) throw new Error("expected a private JWK with a kid");
    const algorithm = jwk.alg ?? (jwk.kty === "EC" ? "ES256" : "RS256");
    if (algorithm !== "ES256" && algorithm !== "RS256") throw new Error(`unsupported alg ${algorithm}`);
    return { key: crypto.createPrivateKey({ key: jwk, format: "jwk" }), kid: jwk.kid, algorithm };
  } catch (err) {
    console.error("SUPABASE_JWT_SIGNING_KEY is not a usable private JWK; realtime is disabled", err);
    return null;
  }
}

const supabaseSigningKey = loadSupabaseSigningKey();

/** Short-lived JWT so the client can subscribe to Supabase Realtime with RLS. */
export function signSupabaseAccessToken(userId: string): string | null {
  if (!supabaseSigningKey) return null;
  return jwt.sign(
    {
      sub: userId,
      role: "authenticated",
      aud: "authenticated",
      iss: "supabase",
    },
    supabaseSigningKey.key,
    { algorithm: supabaseSigningKey.algorithm, keyid: supabaseSigningKey.kid, expiresIn: "1h" },
  );
}

export function isSupabaseRealtimeConfigured(): boolean {
  return Boolean(supabaseSigningKey && process.env.SUPABASE_URL);
}
