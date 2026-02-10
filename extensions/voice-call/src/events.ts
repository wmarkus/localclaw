import { EventEmitter } from "node:events";
import type { VoiceCallEvent, VoiceCallEventBus } from "./types.js";

const EVENT_NAME = "event";

export function createVoiceCallEventBus(): VoiceCallEventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);

  return {
    on: (handler) => {
      emitter.on(EVENT_NAME, handler);
    },
    off: (handler) => {
      emitter.off(EVENT_NAME, handler);
    },
    emit: (event: VoiceCallEvent) => {
      emitter.emit(EVENT_NAME, event);
    },
  };
}
