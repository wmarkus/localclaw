import Foundation
import Testing
@testable import OpenClaw

@Suite
struct ModelCatalogLoaderTests {
    @Test
    func loadParsesModelsFromTypeScriptAndSorts() async throws {
        let src = """
        export const MODELS = {
          ollama: {
            "gpt-oss-20b": { name: "GPT OSS 20B", contextWindow: 65536 } satisfies any,
            "gpt-oss-120b": { name: "GPT OSS 120B", contextWindow: 128000 } as any,
            "tiny-llama": { contextWindow: 4096 },
          },
        };
        """

        let tmp = FileManager().temporaryDirectory
            .appendingPathComponent("models-\(UUID().uuidString).ts")
        defer { try? FileManager().removeItem(at: tmp) }
        try src.write(to: tmp, atomically: true, encoding: .utf8)

        let choices = try await ModelCatalogLoader.load(from: tmp.path)
        #expect(choices.count == 3)
        #expect(choices.first?.provider == "ollama")
        #expect(choices.first?.id == "gpt-oss-120b")

        let ids = Set(choices.map(\.id))
        #expect(ids == Set(["gpt-oss-20b", "gpt-oss-120b", "tiny-llama"]))

        let ollama = choices.filter { $0.provider == "ollama" }
        let ollamaNames = ollama.map(\.name)
        #expect(ollamaNames == ollamaNames.sorted { a, b in
            a.localizedCaseInsensitiveCompare(b) == .orderedAscending
        })
    }

    @Test
    func loadWithNoExportReturnsEmptyChoices() async throws {
        let src = "const NOPE = 1;"
        let tmp = FileManager().temporaryDirectory
            .appendingPathComponent("models-\(UUID().uuidString).ts")
        defer { try? FileManager().removeItem(at: tmp) }
        try src.write(to: tmp, atomically: true, encoding: .utf8)

        let choices = try await ModelCatalogLoader.load(from: tmp.path)
        #expect(choices.isEmpty)
    }
}
