---
summary: "Talk mode: continuous speech conversations"
read_when:
  - Implementing Talk mode on macOS/iOS/Android
  - Changing voice and interrupt behavior
title: "Talk Mode"
---

# Talk Mode

Talk mode is a continuous voice conversation loop:

1. Listen for speech
2. Send transcript to the model (main session)
3. Wait for the response
4. Speak it via the configured voice provider on the node

## Behavior (macOS)

- **Always-on overlay** while Talk mode is enabled.
- **Listening → Thinking → Speaking** phase transitions.
- On a **short pause** (silence window), the current transcript is sent.
- Replies are **written to WebChat** (same as typing).
- **Interrupt on speech** (default on): if the user starts talking while the assistant is speaking, we stop playback and note the interruption timestamp for the next prompt.

## Voice directives in replies

The assistant may prefix its reply with a **single JSON line** to control voice:

```json
{ "voice": "<voice-id>", "once": true }
```

Rules:

- First non-empty line only.
- Unknown keys are ignored.
- `once: true` applies to the current reply only.
- Without `once`, the voice becomes the new default for Talk mode.
- The JSON line is stripped before playback.

## Config (`~/.openclaw/openclaw.json`)

```json5
{
  talk: {
    voiceId: "voice_id",
    modelId: "voice_model_id",
    outputFormat: "mp3_44100_128",
    apiKey: "voice_provider_api_key",
    interruptOnSpeech: true,
  },
}
```

Defaults:

- `interruptOnSpeech`: true
- `voiceId`, `modelId`, `apiKey`, `outputFormat`: optional; node/provider-specific

## Notes

- Requires Speech + Microphone permissions.
- Uses `chat.send` against session key `main`.
- Talk requires a connected mobile node with voice output configured.
