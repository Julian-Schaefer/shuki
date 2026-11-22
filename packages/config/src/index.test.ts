import { describe, expect, it } from "vitest";
import { loadEnv, serverEnvSchema } from "./index";

const base = {
  DATABASE_URL: "postgres://shuki:shuki@localhost:5432/shuki",
  S3_BUCKET: "shuki",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("loadEnv", () => {
  it("applies defaults", () => {
    const env = loadEnv(serverEnvSchema, base);
    expect(env.PORT).toBe(3000);
    expect(env.ALLOW_REGISTRATION).toBe(true);
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it("treats empty strings as unset", () => {
    const env = loadEnv(serverEnvSchema, { ...base, AI_BASE_URL: "", PORT: "" });
    expect(env.AI_BASE_URL).toBeUndefined();
    expect(env.PORT).toBe(3000);
  });

  it("parses boolean strings", () => {
    const env = loadEnv(serverEnvSchema, { ...base, ALLOW_REGISTRATION: "false" });
    expect(env.ALLOW_REGISTRATION).toBe(false);
  });

  it("reports missing variables", () => {
    expect(() => loadEnv(serverEnvSchema, {})).toThrow(/BETTER_AUTH_SECRET/);
  });
});
