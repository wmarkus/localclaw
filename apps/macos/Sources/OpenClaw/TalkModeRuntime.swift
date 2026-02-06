import AVFoundation
import OpenClawChatUI
import OpenClawKit
import Foundation
import OSLog
import Speech

actor TalkModeRuntime {
    static let shared = TalkModeRuntime()

    private let logger = Logger(subsystem: "ai.openclaw", category: "talk.runtime")
    private let ttsLogger = Logger(subsystem: "ai.openclaw", category: "talk.tts")

    private final class RMSMeter: @unchecked Sendable {
        private let lock = NSLock()
        private var latestRMS: Double = 0

        func set(_ rms: Double) {
            self.lock.lock()
            self.latestRMS = rms
            self.lock.unlock()
        }

        func get() -> Double {
            self.lock.lock()
            let value = self.latestRMS
            self.lock.unlock()
            return value
        }
    }

    private var recognizer: SFSpeechRecognizer?
    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var recognitionGeneration: Int = 0
    private var rmsTask: Task<Void, Never>?
    private let rmsMeter = RMSMeter()

    private var captureTask: Task<Void, Never>?
    private var silenceTask: Task<Void, Never>?
    private var phase: TalkModePhase = .idle
    private var isEnabled = false
    private var isPaused = false
    private var lifecycleGeneration: Int = 0

    private var lastHeard: Date?
    private var noiseFloorRMS: Double = 1e-4
    private var lastTranscript: String = ""
    private var lastSpeechEnergyAt: Date?

    private var interruptOnSpeech: Bool = true
    private var lastInterruptedAtSeconds: Double?
    private var lastSpokenText: String?

    private let silenceWindow: TimeInterval = 0.7
    private let minSpeechRMS: Double = 1e-3
    private let speechBoostFactor: Double = 6.0

    // MARK: - Lifecycle

    func setEnabled(_ enabled: Bool) async {
        guard enabled != self.isEnabled else { return }
        self.isEnabled = enabled
        self.lifecycleGeneration &+= 1
        if enabled {
            await self.start()
        } else {
            await self.stop()
        }
    }

    func setPaused(_ paused: Bool) async {
        guard paused != self.isPaused else { return }
        self.isPaused = paused
        await MainActor.run { TalkModeController.shared.updateLevel(0) }

        guard self.isEnabled else { return }

        if paused {
            self.lastTranscript = ""
            self.lastHeard = nil
            self.lastSpeechEnergyAt = nil
            await self.stopRecognition()
            return
        }

        if self.phase == .idle || self.phase == .listening {
            await self.startRecognition()
            self.phase = .listening
            await MainActor.run { TalkModeController.shared.updatePhase(.listening) }
            self.startSilenceMonitor()
        }
    }

    private func isCurrent(_ generation: Int) -> Bool {
        generation == self.lifecycleGeneration && self.isEnabled
    }

    private func start() async {
        let gen = self.lifecycleGeneration
        guard voiceWakeSupported else { return }
        guard PermissionManager.voiceWakePermissionsGranted() else {
            self.logger.debug("talk runtime not starting: permissions missing")
            return
        }
        await self.reloadConfig()
        guard self.isCurrent(gen) else { return }
        if self.isPaused {
            self.phase = .idle
            await MainActor.run {
                TalkModeController.shared.updateLevel(0)
                TalkModeController.shared.updatePhase(.idle)
            }
            return
        }
        await self.startRecognition()
        guard self.isCurrent(gen) else { return }
        self.phase = .listening
        await MainActor.run { TalkModeController.shared.updatePhase(.listening) }
        self.startSilenceMonitor()
    }

    private func stop() async {
        self.captureTask?.cancel()
        self.captureTask = nil
        self.silenceTask?.cancel()
        self.silenceTask = nil

        // Stop audio before changing phase (stopSpeaking is gated on .speaking).
        await self.stopSpeaking(reason: .manual)

        self.lastTranscript = ""
        self.lastHeard = nil
        self.lastSpeechEnergyAt = nil
        self.phase = .idle
        await self.stopRecognition()
        await MainActor.run {
            TalkModeController.shared.updateLevel(0)
            TalkModeController.shared.updatePhase(.idle)
        }
    }

    // MARK: - Speech recognition

    private struct RecognitionUpdate {
        let transcript: String?
        let hasConfidence: Bool
        let isFinal: Bool
        let errorDescription: String?
        let generation: Int
    }

    private func startRecognition() async {
        await self.stopRecognition()
        self.recognitionGeneration &+= 1
        let generation = self.recognitionGeneration

        let locale = await MainActor.run { AppStateStore.shared.voiceWakeLocaleID }
        self.recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale))
        guard let recognizer, recognizer.isAvailable else {
            self.logger.error("talk recognizer unavailable")
            return
        }

        self.recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        self.recognitionRequest?.shouldReportPartialResults = true
        guard let request = self.recognitionRequest else { return }

        if self.audioEngine == nil {
            self.audioEngine = AVAudioEngine()
        }
        guard let audioEngine = self.audioEngine else { return }

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        let meter = self.rmsMeter
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak request, meter] buffer, _ in
            request?.append(buffer)
            if let rms = Self.rmsLevel(buffer: buffer) {
                meter.set(rms)
            }
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            self.logger.error("talk audio engine start failed: \(error.localizedDescription, privacy: .public)")
            return
        }

        self.startRMSTicker(meter: meter)

        self.recognitionTask = recognizer.recognitionTask(with: request) { [weak self, generation] result, error in
            guard let self else { return }
            let segments = result?.bestTranscription.segments ?? []
            let transcript = result?.bestTranscription.formattedString
            let update = RecognitionUpdate(
                transcript: transcript,
                hasConfidence: segments.contains { $0.confidence > 0.6 },
                isFinal: result?.isFinal ?? false,
                errorDescription: error?.localizedDescription,
                generation: generation)
            Task { await self.handleRecognition(update) }
        }
    }

    private func stopRecognition() async {
        self.recognitionGeneration &+= 1
        self.recognitionTask?.cancel()
        self.recognitionTask = nil
        self.recognitionRequest?.endAudio()
        self.recognitionRequest = nil
        self.audioEngine?.inputNode.removeTap(onBus: 0)
        self.audioEngine?.stop()
        self.audioEngine = nil
        self.recognizer = nil
        self.rmsTask?.cancel()
        self.rmsTask = nil
    }

    private func startRMSTicker(meter: RMSMeter) {
        self.rmsTask?.cancel()
        self.rmsTask = Task { [weak self, meter] in
            while let self {
                try? await Task.sleep(nanoseconds: 50_000_000)
                if Task.isCancelled { return }
                await self.noteAudioLevel(rms: meter.get())
            }
        }
    }

    private func handleRecognition(_ update: RecognitionUpdate) async {
        guard update.generation == self.recognitionGeneration else { return }
        guard !self.isPaused else { return }
        if let errorDescription = update.errorDescription {
            self.logger.debug("talk recognition error: \(errorDescription, privacy: .public)")
        }
        guard let transcript = update.transcript else { return }

        let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        if self.phase == .speaking, self.interruptOnSpeech {
            if await self.shouldInterrupt(transcript: trimmed, hasConfidence: update.hasConfidence) {
                await self.stopSpeaking(reason: .speech)
                self.lastTranscript = ""
                self.lastHeard = nil
                await self.startListening()
            }
            return
        }

        guard self.phase == .listening else { return }

        if !trimmed.isEmpty {
            self.lastTranscript = trimmed
            self.lastHeard = Date()
        }

        if update.isFinal {
            self.lastTranscript = trimmed
        }
    }

    // MARK: - Silence handling

    private func startSilenceMonitor() {
        self.silenceTask?.cancel()
        self.silenceTask = Task { [weak self] in
            await self?.silenceLoop()
        }
    }

    private func silenceLoop() async {
        while self.isEnabled {
            try? await Task.sleep(nanoseconds: 200_000_000)
            await self.checkSilence()
        }
    }

    private func checkSilence() async {
        guard !self.isPaused else { return }
        guard self.phase == .listening else { return }
        let transcript = self.lastTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !transcript.isEmpty else { return }
        guard let lastHeard else { return }
        let elapsed = Date().timeIntervalSince(lastHeard)
        guard elapsed >= self.silenceWindow else { return }
        await self.finalizeTranscript(transcript)
    }

    private func startListening() async {
        self.phase = .listening
        self.lastTranscript = ""
        self.lastHeard = nil
        await MainActor.run {
            TalkModeController.shared.updatePhase(.listening)
            TalkModeController.shared.updateLevel(0)
        }
    }

    private func finalizeTranscript(_ text: String) async {
        self.lastTranscript = ""
        self.lastHeard = nil
        self.phase = .thinking
        await MainActor.run { TalkModeController.shared.updatePhase(.thinking) }
        await self.stopRecognition()
        await self.sendAndSpeak(text)
    }

    // MARK: - Gateway + TTS

    private func sendAndSpeak(_ transcript: String) async {
        let gen = self.lifecycleGeneration
        await self.reloadConfig()
        guard self.isCurrent(gen) else { return }
        let prompt = self.buildPrompt(transcript: transcript)
        let activeSessionKey = await MainActor.run { WebChatManager.shared.activeSessionKey }
        let sessionKey: String = if let activeSessionKey {
            activeSessionKey
        } else {
            await GatewayConnection.shared.mainSessionKey()
        }
        let runId = UUID().uuidString
        let startedAt = Date().timeIntervalSince1970
        self.logger.info(
            "talk send start runId=\(runId, privacy: .public) " +
                "session=\(sessionKey, privacy: .public) " +
                "chars=\(prompt.count, privacy: .public)")

        do {
            let response = try await GatewayConnection.shared.chatSend(
                sessionKey: sessionKey,
                message: prompt,
                thinking: "low",
                idempotencyKey: runId,
                attachments: [])
            guard self.isCurrent(gen) else { return }
            self.logger.info(
                "talk chat.send ok runId=\(response.runId, privacy: .public) " +
                    "session=\(sessionKey, privacy: .public)")

            guard let assistantText = await self.waitForAssistantText(
                sessionKey: sessionKey,
                since: startedAt,
                timeoutSeconds: 45)
            else {
                self.logger.warning("talk assistant text missing after timeout")
                await self.startListening()
                await self.startRecognition()
                return
            }
            guard self.isCurrent(gen) else { return }

            self.logger.info("talk assistant text len=\(assistantText.count, privacy: .public)")
            await self.playAssistant(text: assistantText)
            guard self.isCurrent(gen) else { return }
            await self.resumeListeningIfNeeded()
            return
        } catch {
            self.logger.error("talk chat.send failed: \(error.localizedDescription, privacy: .public)")
            await self.resumeListeningIfNeeded()
            return
        }
    }

    private func resumeListeningIfNeeded() async {
        if self.isPaused {
            self.lastTranscript = ""
            self.lastHeard = nil
            self.lastSpeechEnergyAt = nil
            await MainActor.run {
                TalkModeController.shared.updateLevel(0)
            }
            return
        }
        await self.startListening()
        await self.startRecognition()
    }

    private func buildPrompt(transcript: String) -> String {
        let interrupted = self.lastInterruptedAtSeconds
        self.lastInterruptedAtSeconds = nil
        return TalkPromptBuilder.build(transcript: transcript, interruptedAtSeconds: interrupted)
    }

    private func waitForAssistantText(
        sessionKey: String,
        since: Double,
        timeoutSeconds: Int) async -> String?
    {
        let deadline = Date().addingTimeInterval(TimeInterval(timeoutSeconds))
        while Date() < deadline {
            if let text = await self.latestAssistantText(sessionKey: sessionKey, since: since) {
                return text
            }
            try? await Task.sleep(nanoseconds: 300_000_000)
        }
        return nil
    }

    private func latestAssistantText(sessionKey: String, since: Double? = nil) async -> String? {
        do {
            let history = try await GatewayConnection.shared.chatHistory(sessionKey: sessionKey)
            let messages = history.messages ?? []
            let decoded: [OpenClawChatMessage] = messages.compactMap { item in
                guard let data = try? JSONEncoder().encode(item) else { return nil }
                return try? JSONDecoder().decode(OpenClawChatMessage.self, from: data)
            }
            let assistant = decoded.last { message in
                guard message.role == "assistant" else { return false }
                guard let since else { return true }
                guard let timestamp = message.timestamp else { return false }
                return TalkHistoryTimestamp.isAfter(timestamp, sinceSeconds: since)
            }
            guard let assistant else { return nil }
            let text = assistant.content.compactMap(\.text).joined(separator: "\n")
            let trimmed = text.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        } catch {
            self.logger.error("talk history fetch failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private func playAssistant(text: String) async {
        guard let input = await self.preparePlaybackInput(text: text) else { return }
        do {
            try await self.playSystemVoice(input: input)
        } catch {
            self.ttsLogger.error("talk system voice failed: \(error.localizedDescription, privacy: .public)")
        }

        if self.phase == .speaking {
            self.phase = .thinking
            await MainActor.run { TalkModeController.shared.updatePhase(.thinking) }
        }
    }

    private struct TalkPlaybackInput {
        let generation: Int
        let cleanedText: String
        let directive: TalkDirective?
        let language: String?
        let synthTimeoutSeconds: Double
    }

    private func preparePlaybackInput(text: String) async -> TalkPlaybackInput? {
        let gen = self.lifecycleGeneration
        let parse = TalkDirectiveParser.parse(text)
        let directive = parse.directive
        let cleaned = parse.stripped.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return nil }
        guard self.isCurrent(gen) else { return nil }

        if !parse.unknownKeys.isEmpty {
            self.logger
                .warning(
                    "talk directive ignored keys: " +
                        "\(parse.unknownKeys.joined(separator: ","), privacy: .public)")
        }

        let rawLanguage = directive?.language?.trimmingCharacters(in: .whitespacesAndNewlines)
        let language = (rawLanguage?.isEmpty == false) ? rawLanguage : nil

        self.lastSpokenText = cleaned

        let synthTimeoutSeconds = max(20.0, min(90.0, Double(cleaned.count) * 0.12))

        guard self.isCurrent(gen) else { return nil }

        return TalkPlaybackInput(
            generation: gen,
            cleanedText: cleaned,
            directive: directive,
            language: language,
            synthTimeoutSeconds: synthTimeoutSeconds)
    }

    private func playSystemVoice(input: TalkPlaybackInput) async throws {
        self.ttsLogger.info("talk system voice start chars=\(input.cleanedText.count, privacy: .public)")
        if self.interruptOnSpeech {
            guard await self.prepareForPlayback(generation: input.generation) else { return }
        }
        await MainActor.run { TalkModeController.shared.updatePhase(.speaking) }
        self.phase = .speaking
        await TalkSystemSpeechSynthesizer.shared.stop()
        try await TalkSystemSpeechSynthesizer.shared.speak(
            text: input.cleanedText,
            language: input.language)
        self.ttsLogger.info("talk system voice done")
    }

    private func prepareForPlayback(generation: Int) async -> Bool {
        await self.startRecognition()
        return self.isCurrent(generation)
    }

    func stopSpeaking(reason: TalkStopReason) async {
        await TalkSystemSpeechSynthesizer.shared.stop()
        guard self.phase == .speaking else { return }
        if reason == .manual {
            return
        }
        if reason == .speech || reason == .userTap {
            await self.startListening()
            return
        }
        self.phase = .thinking
        await MainActor.run { TalkModeController.shared.updatePhase(.thinking) }
    }
}

extension TalkModeRuntime {
    // MARK: - Config

    private func reloadConfig() async {
        let cfg = await self.fetchTalkConfig()
        self.interruptOnSpeech = cfg.interruptOnSpeech
        self.logger
            .info(
                "talk config interrupt=\(cfg.interruptOnSpeech, privacy: .public)")
    }

    private struct TalkRuntimeConfig {
        let interruptOnSpeech: Bool
    }

    private func fetchTalkConfig() async -> TalkRuntimeConfig {
        do {
            let snap: ConfigSnapshot = try await GatewayConnection.shared.requestDecoded(
                method: .configGet,
                params: nil,
                timeoutMs: 8000)
            let talk = snap.config?["talk"]?.dictionaryValue
            let ui = snap.config?["ui"]?.dictionaryValue
            let rawSeam = ui?["seamColor"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            await MainActor.run {
                AppStateStore.shared.seamColorHex = rawSeam.isEmpty ? nil : rawSeam
            }
            let interrupt = talk?["interruptOnSpeech"]?.boolValue
            return TalkRuntimeConfig(
                interruptOnSpeech: interrupt ?? true)
        } catch {
            return TalkRuntimeConfig(
                interruptOnSpeech: true)
        }
    }

    // MARK: - Audio level handling

    private func noteAudioLevel(rms: Double) async {
        if self.phase != .listening, self.phase != .speaking { return }
        let alpha: Double = rms < self.noiseFloorRMS ? 0.08 : 0.01
        self.noiseFloorRMS = max(1e-7, self.noiseFloorRMS + (rms - self.noiseFloorRMS) * alpha)

        let threshold = max(self.minSpeechRMS, self.noiseFloorRMS * self.speechBoostFactor)
        if rms >= threshold {
            let now = Date()
            self.lastHeard = now
            self.lastSpeechEnergyAt = now
        }

        if self.phase == .listening {
            let clamped = min(1.0, max(0.0, rms / max(self.minSpeechRMS, threshold)))
            await MainActor.run { TalkModeController.shared.updateLevel(clamped) }
        }
    }

    private static func rmsLevel(buffer: AVAudioPCMBuffer) -> Double? {
        guard let channelData = buffer.floatChannelData?.pointee else { return nil }
        let frameCount = Int(buffer.frameLength)
        guard frameCount > 0 else { return nil }
        var sum: Double = 0
        for i in 0..<frameCount {
            let sample = Double(channelData[i])
            sum += sample * sample
        }
        return sqrt(sum / Double(frameCount))
    }

    private func shouldInterrupt(transcript: String, hasConfidence: Bool) async -> Bool {
        let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 3 else { return false }
        if self.isLikelyEcho(of: trimmed) { return false }
        let now = Date()
        if let lastSpeechEnergyAt, now.timeIntervalSince(lastSpeechEnergyAt) > 0.35 {
            return false
        }
        return hasConfidence
    }

    private func isLikelyEcho(of transcript: String) -> Bool {
        guard let spoken = self.lastSpokenText?.lowercased(), !spoken.isEmpty else { return false }
        let probe = transcript.lowercased()
        if probe.count < 6 {
            return spoken.contains(probe)
        }
        return spoken.contains(probe)
    }

    private static func resolveSpeed(speed: Double?, rateWPM: Int?, logger: Logger) -> Double? {
        if let rateWPM, rateWPM > 0 {
            let resolved = Double(rateWPM) / 175.0
            if resolved <= 0.5 || resolved >= 2.0 {
                logger.warning("talk rateWPM out of range: \(rateWPM, privacy: .public)")
                return nil
            }
            return resolved
        }
        if let speed {
            if speed <= 0.5 || speed >= 2.0 {
                logger.warning("talk speed out of range: \(speed, privacy: .public)")
                return nil
            }
            return speed
        }
        return nil
    }

    private static func validatedUnit(_ value: Double?, name: String, logger: Logger) -> Double? {
        guard let value else { return nil }
        if value < 0 || value > 1 {
            logger.warning("talk \(name, privacy: .public) out of range: \(value, privacy: .public)")
            return nil
        }
        return value
    }

    private static func validatedSeed(_ value: Int?, logger: Logger) -> UInt32? {
        guard let value else { return nil }
        if value < 0 || value > 4_294_967_295 {
            logger.warning("talk seed out of range: \(value, privacy: .public)")
            return nil
        }
        return UInt32(value)
    }

    private static func validatedNormalize(_ value: String?, logger: Logger) -> String? {
        guard let value else { return nil }
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard ["auto", "on", "off"].contains(normalized) else {
            logger.warning("talk normalize invalid: \(normalized, privacy: .public)")
            return nil
        }
        return normalized
    }
}
