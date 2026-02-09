import type { RuntimeEnv } from "../../runtime.js";
import { DEFAULT_PROVIDER } from "../../agents/defaults.js";
import { ensureOpenClawModelsJson } from "../../agents/models-config.js";
import { loadConfig } from "../../config/config.js";
import { logConfigUpdated } from "../../config/logging.js";
import { assertLocalOnlyProvider, updateConfig } from "./shared.js";

type OllamaModel = {
  name: string;
  modified_at?: string;
  size?: number;
  details?: {
    parameter_size?: string;
  };
};

type OllamaTagsResponse = {
  models?: OllamaModel[];
};

type ScanCandidate = {
  id: string;
  paramsB?: number;
  modifiedAtMs?: number;
  sizeBytes?: number;
};

const OLLAMA_API_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_CANDIDATES = 6;

function parseNumberOption(raw: string | undefined, label: string): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${label}: "${raw}"`);
  }
  return parsed;
}

function parseIntOption(raw: string | undefined, label: string): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${label}: "${raw}"`);
  }
  return parsed;
}

function parseParamSizeToBillions(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const match = raw.trim().match(/^([\d.]+)\s*([kmbt])?$/i);
  if (!match) {
    return undefined;
  }
  const value = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const suffix = (match[2] ?? "b").toLowerCase();
  switch (suffix) {
    case "t":
      return value * 1000;
    case "b":
      return value;
    case "m":
      return value / 1000;
    case "k":
      return value / 1_000_000;
    default:
      return value;
  }
}

function formatParamSize(paramsB?: number): string | undefined {
  if (!paramsB || !Number.isFinite(paramsB)) {
    return undefined;
  }
  if (paramsB >= 1000) {
    return `${Math.round(paramsB / 100) / 10}T`;
  }
  if (paramsB >= 1) {
    return `${Math.round(paramsB * 10) / 10}B`;
  }
  const paramsM = paramsB * 1000;
  if (paramsM >= 1) {
    return `${Math.round(paramsM)}M`;
  }
  return undefined;
}

function formatAgeDays(modifiedAtMs?: number): string | undefined {
  if (!modifiedAtMs || !Number.isFinite(modifiedAtMs)) {
    return undefined;
  }
  const days = Math.max(0, Math.round((Date.now() - modifiedAtMs) / 86_400_000));
  return `${days}d`;
}

async function fetchOllamaTags(timeoutMs: number): Promise<OllamaModel[]> {
  const response = await fetch(`${OLLAMA_API_BASE_URL}/api/tags`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Ollama tags request failed (${response.status})`);
  }
  const data = (await response.json()) as OllamaTagsResponse;
  return Array.isArray(data.models) ? data.models : [];
}

function toCandidates(models: OllamaModel[]): ScanCandidate[] {
  return models
    .map((model) => {
      const id = String(model.name ?? "").trim();
      if (!id) {
        return null;
      }
      const modifiedAtMs = model.modified_at ? Date.parse(model.modified_at) : undefined;
      const paramsB = parseParamSizeToBillions(model.details?.parameter_size);
      return {
        id,
        paramsB,
        modifiedAtMs: Number.isFinite(modifiedAtMs) ? modifiedAtMs : undefined,
        sizeBytes: typeof model.size === "number" ? model.size : undefined,
      } satisfies ScanCandidate;
    })
    .filter((entry): entry is ScanCandidate => Boolean(entry));
}

function filterCandidates(params: {
  candidates: ScanCandidate[];
  minParamsB?: number;
  maxAgeDays?: number;
}): ScanCandidate[] {
  const { candidates, minParamsB, maxAgeDays } = params;
  return candidates.filter((candidate) => {
    if (minParamsB !== undefined) {
      if (!candidate.paramsB || candidate.paramsB < minParamsB) {
        return false;
      }
    }
    if (maxAgeDays !== undefined) {
      if (!candidate.modifiedAtMs) {
        return false;
      }
      const ageDays = (Date.now() - candidate.modifiedAtMs) / 86_400_000;
      if (ageDays > maxAgeDays) {
        return false;
      }
    }
    return true;
  });
}

function sortCandidates(candidates: ScanCandidate[]): ScanCandidate[] {
  return [...candidates].sort((a, b) => {
    const paramsA = a.paramsB ?? -1;
    const paramsB = b.paramsB ?? -1;
    if (paramsA !== paramsB) {
      return paramsB - paramsA;
    }
    const modifiedA = a.modifiedAtMs ?? 0;
    const modifiedB = b.modifiedAtMs ?? 0;
    if (modifiedA !== modifiedB) {
      return modifiedB - modifiedA;
    }
    return a.id.localeCompare(b.id);
  });
}

async function applyDefaultModel(params: { model: string; runtime: RuntimeEnv; log: boolean }) {
  const updated = await updateConfig((cfg) => {
    const key = params.model;
    const nextModels = { ...cfg.agents?.defaults?.models };
    if (!nextModels[key]) {
      nextModels[key] = {};
    }
    const existingModel = cfg.agents?.defaults?.model as
      | { primary?: string; fallbacks?: string[] }
      | undefined;
    return {
      ...cfg,
      agents: {
        ...cfg.agents,
        defaults: {
          ...cfg.agents?.defaults,
          model: {
            ...(existingModel?.fallbacks ? { fallbacks: existingModel.fallbacks } : undefined),
            primary: key,
          },
          models: nextModels,
        },
      },
    };
  });
  if (params.log) {
    logConfigUpdated(params.runtime);
    params.runtime.log(
      `Default model: ${updated.agents?.defaults?.model?.primary ?? params.model}`,
    );
  }
}

async function applyImageModel(params: { model: string; runtime: RuntimeEnv; log: boolean }) {
  const updated = await updateConfig((cfg) => {
    const key = params.model;
    const nextModels = { ...cfg.agents?.defaults?.models };
    if (!nextModels[key]) {
      nextModels[key] = {};
    }
    const existingModel = cfg.agents?.defaults?.imageModel as
      | { primary?: string; fallbacks?: string[] }
      | undefined;
    return {
      ...cfg,
      agents: {
        ...cfg.agents,
        defaults: {
          ...cfg.agents?.defaults,
          imageModel: {
            ...(existingModel?.fallbacks ? { fallbacks: existingModel.fallbacks } : undefined),
            primary: key,
          },
          models: nextModels,
        },
      },
    };
  });
  if (params.log) {
    logConfigUpdated(params.runtime);
    params.runtime.log(
      `Image model: ${updated.agents?.defaults?.imageModel?.primary ?? params.model}`,
    );
  }
}

export async function modelsScanCommand(
  opts: {
    minParams?: string;
    maxAgeDays?: string;
    provider?: string;
    maxCandidates?: string;
    timeout?: string;
    concurrency?: string;
    yes?: boolean;
    input?: boolean;
    setDefault?: boolean;
    setImage?: boolean;
    json?: boolean;
    probe?: boolean;
  },
  runtime: RuntimeEnv,
) {
  try {
    if (opts.provider) {
      assertLocalOnlyProvider(opts.provider);
    }
    if (opts.probe) {
      runtime.error("Note: --probe is not supported for local Ollama scan.");
    }
    if (opts.concurrency) {
      runtime.error("Note: --concurrency is not used for local Ollama scan.");
    }
    if (opts.yes || opts.input === false) {
      runtime.error("Note: local Ollama scan is non-interactive.");
    }

    const minParamsB = parseNumberOption(opts.minParams, "--min-params");
    const maxAgeDays = parseNumberOption(opts.maxAgeDays, "--max-age-days");
    const maxCandidates =
      parseIntOption(opts.maxCandidates, "--max-candidates") ?? DEFAULT_MAX_CANDIDATES;
    const timeoutMs = parseIntOption(opts.timeout, "--timeout") ?? DEFAULT_TIMEOUT_MS;

    const cfg = loadConfig();
    await ensureOpenClawModelsJson(cfg);

    const models = await fetchOllamaTags(timeoutMs);
    if (models.length === 0) {
      runtime.error("No Ollama models found. Is the Ollama server running?");
      runtime.exit(1);
    }

    const allCandidates = toCandidates(models);
    const filtered = filterCandidates({
      candidates: allCandidates,
      minParamsB,
      maxAgeDays,
    });
    if (filtered.length === 0) {
      runtime.error("No Ollama models matched the scan filters.");
      runtime.exit(1);
    }

    const sorted = sortCandidates(filtered);
    const limited =
      maxCandidates > 0 && sorted.length > maxCandidates ? sorted.slice(0, maxCandidates) : sorted;
    const selected = limited[0];
    const selectedRef = selected ? `${DEFAULT_PROVIDER}/${selected.id}` : undefined;

    if (opts.json) {
      runtime.log(
        JSON.stringify(
          {
            provider: DEFAULT_PROVIDER,
            total: sorted.length,
            shown: limited.length,
            filters: {
              minParamsB: minParamsB ?? null,
              maxAgeDays: maxAgeDays ?? null,
            },
            candidates: limited.map((candidate) => ({
              id: candidate.id,
              model: `${DEFAULT_PROVIDER}/${candidate.id}`,
              paramsB: candidate.paramsB ?? null,
              modifiedAt: candidate.modifiedAtMs
                ? new Date(candidate.modifiedAtMs).toISOString()
                : null,
              sizeBytes: candidate.sizeBytes ?? null,
            })),
            selected: selectedRef ?? null,
          },
          null,
          2,
        ),
      );
    } else {
      const limitNote = limited.length < sorted.length ? ` (showing top ${limited.length})` : "";
      runtime.log(`Found ${sorted.length} Ollama models${limitNote}.`);
      for (const candidate of limited) {
        const label = `${DEFAULT_PROVIDER}/${candidate.id}`;
        const parts = [label];
        const sizeLabel = formatParamSize(candidate.paramsB);
        if (sizeLabel) {
          parts.push(`params ${sizeLabel}`);
        }
        const ageLabel = formatAgeDays(candidate.modifiedAtMs);
        if (ageLabel) {
          parts.push(`updated ${ageLabel} ago`);
        }
        runtime.log(`- ${parts.join(" · ")}`);
      }
    }

    if (opts.setDefault || opts.setImage) {
      if (!selectedRef) {
        runtime.error("No models available to apply.");
        runtime.exit(1);
      }
      if (opts.setDefault) {
        await applyDefaultModel({ model: selectedRef, runtime, log: !opts.json });
      }
      if (opts.setImage) {
        await applyImageModel({ model: selectedRef, runtime, log: !opts.json });
      }
    }
  } catch (err) {
    runtime.error(err instanceof Error ? err.message : String(err));
    runtime.exit(1);
  }
}
