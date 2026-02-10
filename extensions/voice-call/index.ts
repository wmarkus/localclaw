import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { registerVoiceCallCli } from "./src/cli.js";
import { createVoiceCallGatewayHandlers } from "./src/gateway.js";
import { createVoiceCallRuntime } from "./src/runtime.js";
import { createVoiceCallTool } from "./src/tool.js";

const plugin = {
  id: "voice-call",
  name: "Voice Call",
  description: "Outbound voice call plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    const runtimePromise = createVoiceCallRuntime(api);
    const handlers = createVoiceCallGatewayHandlers(runtimePromise);

    api.registerGatewayMethod("voicecall.initiate", handlers.initiate);
    api.registerGatewayMethod("voicecall.start", handlers.start);
    api.registerGatewayMethod("voicecall.continue", handlers.continueCall);
    api.registerGatewayMethod("voicecall.speak", handlers.speak);
    api.registerGatewayMethod("voicecall.end", handlers.end);
    api.registerGatewayMethod("voicecall.status", handlers.status);

    api.registerTool(createVoiceCallTool(runtimePromise));

    api.registerCli(
      ({ program, logger }) => {
        registerVoiceCallCli(program, {
          runtimePromise,
          logger,
        });
      },
      { commands: ["voicecall"] },
    );

    api.registerService({
      id: "voice-call-runtime",
      start: async () => {
        await runtimePromise;
      },
      stop: async () => {
        const runtime = await runtimePromise;
        await runtime.stop();
      },
    });
  },
};

export default plugin;
