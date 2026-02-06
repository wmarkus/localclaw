import type { MsgContext } from "../auto-reply/templating.js";
import type { OpenClawConfig } from "../config/config.js";
import type {
  MediaUnderstandingConfig,
  MediaUnderstandingModelConfig,
} from "../config/types.tools.js";
import type {
  MediaAttachment,
  MediaUnderstandingCapability,
  MediaUnderstandingDecision,
  MediaUnderstandingOutput,
  MediaUnderstandingProvider,
} from "./types.js";
import { MediaAttachmentCache, normalizeAttachments } from "./attachments.js";

export type ActiveMediaModel = {
  provider: string;
  model?: string;
};

type ProviderRegistry = Map<string, MediaUnderstandingProvider>;

export type RunCapabilityResult = {
  outputs: MediaUnderstandingOutput[];
  decision: MediaUnderstandingDecision;
};

export function buildProviderRegistry(
  _overrides?: Record<string, MediaUnderstandingProvider>,
): ProviderRegistry {
  return new Map();
}

export function normalizeMediaAttachments(ctx: MsgContext): MediaAttachment[] {
  return normalizeAttachments(ctx);
}

export function createMediaAttachmentCache(attachments: MediaAttachment[]): MediaAttachmentCache {
  return new MediaAttachmentCache(attachments);
}

export async function resolveAutoImageModel(_params: {
  cfg: OpenClawConfig;
  agentDir?: string;
  activeModel?: ActiveMediaModel;
}): Promise<ActiveMediaModel | null> {
  return null;
}

export async function runCapability(params: {
  capability: MediaUnderstandingCapability;
  cfg: OpenClawConfig;
  ctx: MsgContext;
  attachments: MediaAttachmentCache;
  media: MediaAttachment[];
  providerRegistry: ProviderRegistry;
  config?: MediaUnderstandingConfig | MediaUnderstandingModelConfig;
  activeModel?: ActiveMediaModel;
  agentDir?: string;
}): Promise<RunCapabilityResult> {
  void params;
  const attachments = params.media ?? [];
  const decisions = attachments.map((attachment) => ({
    attachmentIndex: attachment.index,
    attempts: [],
  }));
  const outcome = attachments.length === 0 ? "no-attachment" : "disabled";
  return {
    outputs: [],
    decision: {
      capability: params.capability,
      outcome,
      attachments: decisions,
    },
  };
}
