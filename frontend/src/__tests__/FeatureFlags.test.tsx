import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * These tests exercise the build-time VITE_* path instead of mutating the exported
 * FEATURES object at runtime. Each case stubs the env, drops the module cache and
 * imports a fresh copy of the flag module.
 */
async function freshFlags(door?: string, certificates?: string) {
  vi.stubEnv("VITE_FEATURE_DOOR_CHECKIN", door ?? "");
  vi.stubEnv("VITE_FEATURE_CERTIFICATES", certificates ?? "");
  vi.resetModules();
  return import("@/lib/features");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("build-time feature flags", () => {
  it("defaults both desks to off when neither VITE_* variable is set", async () => {
    const { FEATURES, getFeatureFlags } = await freshFlags();
    expect(FEATURES).toEqual({ doorCheckIn: false, certificates: false });
    expect(getFeatureFlags()).toEqual({ doorCheckIn: false, certificates: false });
  });

  it("honours VITE_FEATURE_DOOR_CHECKIN=true for a freshly imported module", async () => {
    const { FEATURES, getFeatureFlags } = await freshFlags("true");
    expect(FEATURES).toEqual({ doorCheckIn: true, certificates: false });
    expect(getFeatureFlags()).toEqual({ doorCheckIn: true, certificates: false });
  });

  it("honours VITE_FEATURE_CERTIFICATES=true for a freshly imported module", async () => {
    const { FEATURES, getFeatureFlags } = await freshFlags(undefined, "true");
    expect(FEATURES).toEqual({ doorCheckIn: false, certificates: true });
    expect(getFeatureFlags()).toEqual({ doorCheckIn: false, certificates: true });
  });

  it("honours both flags together", async () => {
    const { FEATURES, getFeatureFlags } = await freshFlags("true", "true");
    expect(FEATURES).toEqual({ doorCheckIn: true, certificates: true });
    expect(getFeatureFlags()).toEqual({ doorCheckIn: true, certificates: true });
  });

  it("treats anything other than the exact string true as off", async () => {
    const { FEATURES, getFeatureFlags } = await freshFlags("1", "TRUE");
    expect(FEATURES).toEqual({ doorCheckIn: false, certificates: false });
    expect(getFeatureFlags()).toEqual({ doorCheckIn: false, certificates: false });
  });

  it("re-reads the env on every getFeatureFlags call without re-importing", async () => {
    const { getFeatureFlags } = await freshFlags();
    expect(getFeatureFlags()).toEqual({ doorCheckIn: false, certificates: false });
    vi.stubEnv("VITE_FEATURE_DOOR_CHECKIN", "true");
    expect(getFeatureFlags()).toEqual({ doorCheckIn: true, certificates: false });
    vi.stubEnv("VITE_FEATURE_DOOR_CHECKIN", "false");
    vi.stubEnv("VITE_FEATURE_CERTIFICATES", "true");
    expect(getFeatureFlags()).toEqual({ doorCheckIn: false, certificates: true });
  });
});
