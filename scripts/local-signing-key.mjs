// Ensures supabase/signing_keys.json exists (a private ES256 JWK the local stack signs with and the
// API uses for Realtime tokens). Runs before `supabase start`; never overwrites an existing key.
import { existsSync, writeFileSync } from "node:fs";
import { generateKeyPairSync, randomUUID } from "node:crypto";

const PATH = "supabase/signing_keys.json";

if (existsSync(PATH)) process.exit(0);

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = {
  ...privateKey.export({ format: "jwk" }),
  kid: randomUUID(),
  alg: "ES256",
  use: "sig",
  key_ops: ["sign", "verify"],
  ext: true,
};
writeFileSync(PATH, JSON.stringify([jwk], null, 2) + "\n", { mode: 0o600 });
console.log(`Created ${PATH} (local only, git-ignored).`);
