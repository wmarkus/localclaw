import type { OpenClawConfig } from "../../config/config.js";
import type { AuthProfileStore } from "./types.js";

export function formatAuthDoctorHint(params: {
  cfg?: OpenClawConfig;
  store: AuthProfileStore;
  provider: string;
  profileId?: string;
}): string {
  void params;
  return "";
}
