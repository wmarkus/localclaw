package ai.openclaw.android.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VoiceWakeCommandExtractorTest {
  @Test
  fun extractsCommandAfterTriggerWord() {
    val res = VoiceWakeCommandExtractor.extractCommand("OpenClaw take a photo", listOf("openclaw"))
    assertEquals("take a photo", res)
  }

  @Test
  fun extractsCommandWithPunctuation() {
    val res = VoiceWakeCommandExtractor.extractCommand("hey openclaw, what's the weather?", listOf("openclaw"))
    assertEquals("what's the weather?", res)
  }

  @Test
  fun returnsNullWhenNoCommandProvided() {
    assertNull(VoiceWakeCommandExtractor.extractCommand("openclaw", listOf("openclaw")))
    assertNull(VoiceWakeCommandExtractor.extractCommand("hey openclaw!", listOf("openclaw")))
  }
}
