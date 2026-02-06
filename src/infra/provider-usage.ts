export type UsageWindow = {
  label: string;
  usedPercent: number;
  resetAt?: number;
};

export type UsageProviderId = "ollama";

export type ProviderUsageSnapshot = {
  provider: UsageProviderId;
  displayName: string;
  windows: UsageWindow[];
  plan?: string;
  error?: string;
};

export type UsageSummary = {
  updatedAt: number;
  providers: ProviderUsageSnapshot[];
};

export function resolveUsageProviderId(provider?: string | null): UsageProviderId | null {
  if (!provider) {
    return null;
  }
  return provider.trim().toLowerCase() === "ollama" ? "ollama" : null;
}

export async function loadProviderUsageSummary(): Promise<UsageSummary> {
  return {
    updatedAt: Date.now(),
    providers: [],
  };
}

export function formatUsageWindowSummary(_window: UsageWindow): string {
  return "";
}

export function formatUsageSummaryLine(_provider: ProviderUsageSnapshot): string {
  return "";
}

export function formatUsageReportLines(_summary: UsageSummary): string[] {
  return [];
}
