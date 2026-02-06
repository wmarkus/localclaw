import type { OpenClawConfig } from "../../config/config.js";
import type { AuthProfileStore } from "./types.js";

export async function resolveApiKeyForProfile(params: {
  cfg?: OpenClawConfig;
  store: AuthProfileStore;
  profileId: string;
  agentDir?: string;
}): Promise<{ apiKey: string; provider: string; email?: string } | null> {
  const { cfg, store, profileId } = params;
  const cred = store.profiles[profileId];
  if (!cred) {
    return null;
  }
  const profileConfig = cfg?.auth?.profiles?.[profileId];
  if (profileConfig && profileConfig.provider !== cred.provider) {
    return null;
  }
  if (profileConfig && profileConfig.mode !== cred.type) {
    // Compatibility: treat "oauth" config as compatible with stored token profiles.
    if (!(profileConfig.mode === "oauth" && cred.type === "token")) {
      return null;
    }
  }

  if (cred.type === "api_key") {
    const key = cred.key?.trim();
    if (!key) {
      return null;
    }
    return { apiKey: key, provider: cred.provider, email: cred.email };
  }
  if (cred.type === "token") {
    const token = cred.token?.trim();
    if (!token) {
      return null;
    }
    if (
      typeof cred.expires === "number" &&
      Number.isFinite(cred.expires) &&
      cred.expires > 0 &&
      Date.now() >= cred.expires
    ) {
      return null;
    }
    return { apiKey: token, provider: cred.provider, email: cred.email };
  }
  if (cred.type === "oauth") {
    throw new Error(
      `OAuth profiles are not supported in the local-only build (profile: ${profileId}).`,
    );
  }

  return null;
}
