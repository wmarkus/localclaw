export {
  buildBootstrapContextFiles,
  DEFAULT_BOOTSTRAP_MAX_CHARS,
  ensureSessionHeader,
  resolveBootstrapMaxChars,
  stripThoughtSignatures,
} from "./pi-embedded-helpers/bootstrap.js";
export {
  BILLING_ERROR_USER_MESSAGE,
  classifyFailoverReason,
  formatRawAssistantErrorForUi,
  formatAssistantErrorText,
  getApiErrorPayloadFingerprint,
  isAuthAssistantError,
  isAuthErrorMessage,
  isBillingAssistantError,
  parseApiErrorInfo,
  sanitizeUserFacingText,
  isBillingErrorMessage,
  isFormatError,
  isCompactionFailureError,
  isContextOverflowError,
  isLikelyContextOverflowError,
  isFailoverAssistantError,
  isFailoverErrorMessage,
  isImageDimensionErrorMessage,
  isImageSizeError,
  isOverloadedErrorMessage,
  isRawApiErrorPayload,
  isRateLimitAssistantError,
  isRateLimitErrorMessage,
  isTimeoutErrorMessage,
  parseImageDimensionError,
  parseImageSizeError,
} from "./pi-embedded-helpers/errors.js";
export {
  isEmptyAssistantMessageContent,
  sanitizeSessionMessagesImages,
} from "./pi-embedded-helpers/images.js";
export {
  isMessagingToolDuplicate,
  isMessagingToolDuplicateNormalized,
  normalizeTextForComparison,
} from "./pi-embedded-helpers/messaging-dedupe.js";

export { pickFallbackThinkingLevel } from "./pi-embedded-helpers/thinking.js";

export { mergeConsecutiveUserTurns } from "./pi-embedded-helpers/turns.js";
export type { EmbeddedContextFile, FailoverReason } from "./pi-embedded-helpers/types.js";

export type { ToolCallIdMode } from "./tool-call-id.js";
export { isValidToolCallId, sanitizeToolCallId } from "./tool-call-id.js";
