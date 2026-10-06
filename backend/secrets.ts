import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { sql } from "./db";

/** Secrets an admin may set on the Settings page. Each falls back to the environment variable of the same name. */
export const SECRET_NAMES = ["ACCESS_KEY", "OPENAI_API_KEY", "GOOGLE_SERVICE_ACCOUNT_KEY"] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

/** Where a secret's current value comes from, as shown on the Settings page (never the value itself). */
export type SecretSource = "settings" | "environment" | "unset";

const TTL_MS = 30_000;
let memo: { at: number; values: Partial<Record<SecretName, string>> } | null = null;

/** AES-256 key derived from ADMIN_KEY. Changing ADMIN_KEY makes stored secrets unreadable (env fallback applies). */
function key(): Buffer {
  if (!process.env.ADMIN_KEY) throw new Error("ADMIN_KEY is not set");
  return Buffer.from(hkdfSync("sha256", process.env.ADMIN_KEY, "trngprgm", "secrets", 32));
}

/** Encrypts with AES-256-GCM; returns base64(iv | tag | ciphertext). */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

/** Inverse of seal(); returns null if the value was sealed under another ADMIN_KEY or is corrupt. */
export function unseal(sealed: string): string | null {
  try {
    const raw = Buffer.from(sealed, "base64");
    const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Decrypted secrets stored from the Settings page, cached briefly because the proxy reads ACCESS_KEY on every request.
 * ponytail: per-instance 30s cache; another server instance sees a changed secret up to 30s late. */
async function stored(): Promise<Partial<Record<SecretName, string>>> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.values;
  const values: Partial<Record<SecretName, string>> = {};
  if (process.env.ADMIN_KEY) {
    for (const row of await sql`select name, value from secrets`) {
      const plain = unseal(row.value);
      if (plain) values[row.name as SecretName] = plain;
    }
  }
  memo = { at: Date.now(), values };
  return values;
}

/**
 * Current value of a secret: the Settings page value if set, else the environment variable.
 *
 * Args:
 *   name: Which secret.
 *
 * Returns:
 *   The value, or undefined if neither source has one.
 */
export async function secret(name: SecretName): Promise<string | undefined> {
  return (await stored())[name] || process.env[name] || undefined;
}

/** Where each secret comes from, for display. Never returns values. */
export async function secretSources(): Promise<Record<SecretName, SecretSource>> {
  const s = await stored();
  return Object.fromEntries(SECRET_NAMES.map((n) => [n, s[n] ? "settings" : process.env[n] ? "environment" : "unset"])) as Record<SecretName, SecretSource>;
}

/**
 * Stores (or, with an empty value, removes) a secret set on the Settings page.
 *
 * Args:
 *   name: Which secret.
 *   value: New value; "" reverts to the environment variable.
 */
export async function setSecret(name: SecretName, value: string): Promise<void> {
  if (!SECRET_NAMES.includes(name)) throw new Error(`Unknown secret ${name}`);
  if (value) await sql`insert into secrets (name, value) values (${name}, ${seal(value)})
    on conflict (name) do update set value = excluded.value, updated_at = now()`;
  else await sql`delete from secrets where name = ${name}`;
  memo = null;
}
