import dotenv from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

/** Load .env from server/ or monorepo root (npm -w server uses server/ as cwd). */
const envPaths = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}
