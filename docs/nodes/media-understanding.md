---
summary: "Local-only media understanding via CLI tools"
read_when:
  - You want to process images, audio, or video locally
  - You are configuring tools.media
  - You need CLI examples
title: "Media Understanding"
---

# Media understanding

Local-only builds do **not** use remote media providers. Media understanding runs
via **local CLI tools** that you configure under `tools.media`.

## How it works

- Incoming attachments are staged in the agent workspace.
- The configured CLI tool is invoked with the file path and prompt.
- The tool output is injected into the model context.

## Configuration

Each `tools.media.*.models[]` entry can be a CLI command:

```json5
{
  tools: {
    media: {
      image: {
        enabled: true,
        models: [
          {
            type: "cli",
            command: "my-vision-cli",
            args: ["--input", "{{MediaPath}}", "--prompt", "{{Prompt}}"],
          },
        ],
      },
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

Template placeholders you can use in args:

- `{{MediaPath}}`
- `{{Prompt}}`
- `{{MaxChars}}`

## Tips

- Keep CLI output short; long outputs inflate context usage.
- Use `tools.media.*.maxChars` to cap output size.
- Disable a capability by setting `enabled: false`.
