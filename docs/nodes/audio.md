---
summary: "Local audio handling and transcription via CLI tools"
read_when:
  - You want local audio transcription
  - You are configuring tools.media.audio
title: "Audio"
---

# Audio

Local-only builds handle audio using **local CLI tools** you configure under
`tools.media.audio`.

## Example: local transcription

```json5
{
  tools: {
    media: {
      audio: {
        enabled: true,
        models: [
          {
            type: "cli",
            command: "whisper",
            args: ["--model", "base", "{{MediaPath}}"],
          },
        ],
      },
    },
  },
}
```

## Notes

- The CLI tool must accept a file path and output text.
- Large audio files increase processing time and token usage.
- Use `maxBytes` to cap inbound audio size.
