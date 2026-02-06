// Defaults for agent metadata when upstream does not supply them.
// Local-only: use the bundled Ollama model defaults.
export const DEFAULT_PROVIDER = "ollama";
export const DEFAULT_MODEL = "gpt-oss-120b";
// Conservative fallback used when model metadata is unavailable.
export const DEFAULT_CONTEXT_TOKENS = 128_000;
