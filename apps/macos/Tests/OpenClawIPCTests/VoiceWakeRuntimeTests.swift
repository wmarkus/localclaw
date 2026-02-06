import Foundation
import SwabbleKit
import Testing
@testable import OpenClaw

@Suite struct VoiceWakeRuntimeTests {
    @Test func trimsAfterTriggerKeepsPostSpeech() {
        let triggers = ["openclaw", "computer"]
        let text = "hey OpenClaw how are you"
        #expect(VoiceWakeRuntime._testTrimmedAfterTrigger(text, triggers: triggers) == "how are you")
    }

    @Test func trimsAfterTriggerReturnsOriginalWhenNoTrigger() {
        let triggers = ["openclaw"]
        let text = "good morning friend"
        #expect(VoiceWakeRuntime._testTrimmedAfterTrigger(text, triggers: triggers) == text)
    }

    @Test func trimsAfterFirstMatchingTrigger() {
        let triggers = ["buddy", "openclaw"]
        let text = "hello buddy this is after trigger openclaw also here"
        #expect(VoiceWakeRuntime
            ._testTrimmedAfterTrigger(text, triggers: triggers) == "this is after trigger openclaw also here")
    }

    @Test func hasContentAfterTriggerFalseWhenOnlyTrigger() {
        let triggers = ["openclaw"]
        let text = "hey openclaw"
        #expect(!VoiceWakeRuntime._testHasContentAfterTrigger(text, triggers: triggers))
    }

    @Test func hasContentAfterTriggerTrueWhenSpeechContinues() {
        let triggers = ["openclaw"]
        let text = "openclaw write a note"
        #expect(VoiceWakeRuntime._testHasContentAfterTrigger(text, triggers: triggers))
    }

    @Test func gateRequiresGapBetweenTriggerAndCommand() {
        let transcript = "hey openclaw do thing"
        let segments = makeSegments(
            transcript: transcript,
            words: [
                ("hey", 0.0, 0.1),
                ("openclaw", 0.2, 0.1),
                ("do", 0.35, 0.1),
                ("thing", 0.5, 0.1),
            ])
        let config = WakeWordGateConfig(triggers: ["openclaw"], minPostTriggerGap: 0.3)
        #expect(WakeWordGate.match(transcript: transcript, segments: segments, config: config) == nil)
    }

    @Test func gateAcceptsGapAndExtractsCommand() {
        let transcript = "hey openclaw do thing"
        let segments = makeSegments(
            transcript: transcript,
            words: [
                ("hey", 0.0, 0.1),
                ("openclaw", 0.2, 0.1),
                ("do", 0.9, 0.1),
                ("thing", 1.1, 0.1),
            ])
        let config = WakeWordGateConfig(triggers: ["openclaw"], minPostTriggerGap: 0.3)
        #expect(WakeWordGate.match(transcript: transcript, segments: segments, config: config)?.command == "do thing")
    }
}

private func makeSegments(
    transcript: String,
    words: [(String, TimeInterval, TimeInterval)])
-> [WakeWordSegment] {
    var searchStart = transcript.startIndex
    var output: [WakeWordSegment] = []
    for (word, start, duration) in words {
        let range = transcript.range(of: word, range: searchStart..<transcript.endIndex)
        output.append(WakeWordSegment(text: word, start: start, duration: duration, range: range))
        if let range { searchStart = range.upperBound }
    }
    return output
}
