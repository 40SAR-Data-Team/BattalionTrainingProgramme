import { expect, test } from "bun:test";
import { seal, unseal } from "@trng/backend/secrets";

// Use case: keys typed on the Settings page are stored unreadable without the server's ADMIN_KEY.

test("a sealed secret opens only with the same ADMIN_KEY", () => {
  process.env.ADMIN_KEY = "admin-one";
  const sealed = seal("sk-test-123");
  expect(sealed).not.toContain("sk-test-123");
  expect(unseal(sealed)).toBe("sk-test-123");
  process.env.ADMIN_KEY = "admin-two";
  expect(unseal(sealed)).toBeNull();
});

test("sealing twice gives different ciphertext", () => {
  process.env.ADMIN_KEY = "admin-one";
  expect(seal("same")).not.toBe(seal("same"));
});
