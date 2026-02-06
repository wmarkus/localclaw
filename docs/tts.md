---
summary: "Text-to-speech is disabled in the local-only build"
read_when:
  - You want to use /tts commands
  - You are looking for TTS configuration options
title: "Text to Speech (TTS)"
---

# Text to Speech (TTS)

Text-to-speech is **disabled** in this local-only build.

What this means:

- `/tts` commands will report TTS as unavailable.
- `messages.tts` settings are accepted for compatibility but ignored.
- No external voice providers are used.

If you need TTS in the future, it requires reintroducing a voice provider and
is intentionally excluded from the local-only build.
