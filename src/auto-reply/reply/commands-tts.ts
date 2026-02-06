import type { CommandHandler } from "./commands-types.js";

export const handleTtsCommands: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const normalized = params.command.commandBodyNormalized;
  if (normalized === "/tts" || normalized.startsWith("/tts ")) {
    return {
      shouldContinue: false,
      reply: {
        text: "TTS is disabled in the local-only build.",
      },
    };
  }
  return null;
};
