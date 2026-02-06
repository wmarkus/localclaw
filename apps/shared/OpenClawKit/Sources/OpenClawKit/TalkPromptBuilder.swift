public enum TalkPromptBuilder: Sendable {
    public static func build(transcript: String, interruptedAtSeconds: Double?) -> String {
        var lines: [String] = [
            "Talk Mode active. Reply in a concise, spoken tone.",
            "Respond with plain text only (no JSON directives).",
        ]

        if let interruptedAtSeconds {
            let formatted = String(format: "%.1f", interruptedAtSeconds)
            lines.append("Assistant speech interrupted at \(formatted)s.")
        }

        lines.append("")
        lines.append(transcript)
        return lines.joined(separator: "\n")
    }
}
