import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { sendHandlers } from "./send.js";

const mocks = vi.hoisted(() => ({
  deliverOutboundPayloads: vi.fn(),
  appendAssistantMessageToSessionTranscript: vi.fn(async () => ({ ok: true, sessionFile: "x" })),
  recordSessionMetaFromInbound: vi.fn(async () => ({ ok: true })),
}));

const outboundSessionMocks = vi.hoisted(() => ({
  resolveOutboundSessionRoute: vi.fn(),
  ensureOutboundSessionEntry: vi.fn(),
}));

const pluginMocks = vi.hoisted(() => ({
  getChannelPlugin: vi.fn(),
}));

vi.mock("../../config/config.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../config/config.js")>("../../config/config.js");
  return {
    ...actual,
    loadConfig: () => ({}),
  };
});

vi.mock("../../channels/plugins/index.js", () => ({
  getChannelPlugin: pluginMocks.getChannelPlugin,
  normalizeChannelId: (value: string) => value,
}));

vi.mock("../../infra/outbound/targets.js", () => ({
  resolveOutboundTarget: () => ({ ok: true, to: "resolved" }),
}));

vi.mock("../../infra/outbound/deliver.js", () => ({
  deliverOutboundPayloads: mocks.deliverOutboundPayloads,
}));

vi.mock("../../infra/outbound/outbound-session.js", async () => {
  const actual = await vi.importActual<typeof import("../../infra/outbound/outbound-session.js")>(
    "../../infra/outbound/outbound-session.js",
  );
  return {
    ...actual,
    resolveOutboundSessionRoute: outboundSessionMocks.resolveOutboundSessionRoute,
    ensureOutboundSessionEntry: outboundSessionMocks.ensureOutboundSessionEntry,
  };
});

vi.mock("../../config/sessions.js", async () => {
  const actual = await vi.importActual<typeof import("../../config/sessions.js")>(
    "../../config/sessions.js",
  );
  return {
    ...actual,
    appendAssistantMessageToSessionTranscript: mocks.appendAssistantMessageToSessionTranscript,
    recordSessionMetaFromInbound: mocks.recordSessionMetaFromInbound,
  };
});

const makeContext = (): GatewayRequestContext =>
  ({
    dedupe: new Map(),
  }) as unknown as GatewayRequestContext;

beforeEach(() => {
  vi.clearAllMocks();
  pluginMocks.getChannelPlugin.mockReturnValue({ outbound: {} });
});

describe("gateway send mirroring", () => {
  it("does not mirror when delivery returns no results", async () => {
    mocks.deliverOutboundPayloads.mockResolvedValue([]);

    const respond = vi.fn();
    await sendHandlers.send({
      params: {
        to: "channel:C1",
        message: "hi",
        channel: "slack",
        idempotencyKey: "idem-1",
        sessionKey: "agent:main:main",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "1", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        mirror: expect.objectContaining({
          sessionKey: "agent:main:main",
        }),
      }),
    );
  });

  it("mirrors media filenames when delivery succeeds", async () => {
    mocks.deliverOutboundPayloads.mockResolvedValue([{ messageId: "m1", channel: "slack" }]);

    const respond = vi.fn();
    await sendHandlers.send({
      params: {
        to: "channel:C1",
        message: "caption",
        mediaUrl: "https://example.com/files/report.pdf?sig=1",
        channel: "slack",
        idempotencyKey: "idem-2",
        sessionKey: "agent:main:main",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "1", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        mirror: expect.objectContaining({
          sessionKey: "agent:main:main",
          text: "caption",
          mediaUrls: ["https://example.com/files/report.pdf?sig=1"],
        }),
      }),
    );
  });

  it("mirrors MEDIA tags as attachments", async () => {
    mocks.deliverOutboundPayloads.mockResolvedValue([{ messageId: "m2", channel: "slack" }]);

    const respond = vi.fn();
    await sendHandlers.send({
      params: {
        to: "channel:C1",
        message: "Here\nMEDIA:https://example.com/image.png",
        channel: "slack",
        idempotencyKey: "idem-3",
        sessionKey: "agent:main:main",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "1", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        mirror: expect.objectContaining({
          sessionKey: "agent:main:main",
          text: "Here",
          mediaUrls: ["https://example.com/image.png"],
        }),
      }),
    );
  });

  it("lowercases provided session keys for mirroring", async () => {
    mocks.deliverOutboundPayloads.mockResolvedValue([{ messageId: "m-lower", channel: "slack" }]);

    const respond = vi.fn();
    await sendHandlers.send({
      params: {
        to: "channel:C1",
        message: "hi",
        channel: "slack",
        idempotencyKey: "idem-lower",
        sessionKey: "agent:main:slack:channel:C123",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "1", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        mirror: expect.objectContaining({
          sessionKey: "agent:main:slack:channel:c123",
        }),
      }),
    );
  });

  it("derives a target session key when none is provided", async () => {
    mocks.deliverOutboundPayloads.mockResolvedValue([{ messageId: "m3", channel: "slack" }]);
    const derivedRoute = {
      sessionKey: "agent:main:slack:channel:resolved",
      baseSessionKey: "agent:main:slack:channel:resolved",
      peer: { kind: "channel", id: "resolved" },
      chatType: "channel",
      from: "slack:channel:resolved",
      to: "channel:resolved",
      threadId: undefined,
    };
    outboundSessionMocks.resolveOutboundSessionRoute.mockResolvedValueOnce(derivedRoute);
    outboundSessionMocks.ensureOutboundSessionEntry.mockResolvedValueOnce();

    const respond = vi.fn();
    await sendHandlers.send({
      params: {
        to: "channel:C1",
        message: "hello",
        channel: "slack",
        idempotencyKey: "idem-4",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "1", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(outboundSessionMocks.resolveOutboundSessionRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "slack",
        agentId: "main",
        accountId: undefined,
        target: "resolved",
      }),
    );
    expect(outboundSessionMocks.ensureOutboundSessionEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        route: derivedRoute,
      }),
    );
    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        mirror: expect.objectContaining({
          sessionKey: derivedRoute.sessionKey,
          agentId: "main",
        }),
      }),
    );
  });

  it("shares inflight work and caches by idempotency key", async () => {
    let resolveDelivery!: (value: { messageId: string; channel: string }[]) => void;
    const deliveryPromise = new Promise<{ messageId: string; channel: string }[]>((resolve) => {
      resolveDelivery = resolve;
    });
    mocks.deliverOutboundPayloads.mockReturnValueOnce(deliveryPromise);

    const context = makeContext();
    const params = {
      to: "channel:C1",
      message: "hello",
      channel: "slack",
      idempotencyKey: "idem-concurrent",
      sessionKey: "agent:main:main",
    };

    const respond1 = vi.fn();
    const respond2 = vi.fn();
    const respond3 = vi.fn();

    const first = sendHandlers.send({
      params,
      respond: respond1,
      context,
      req: { type: "req", id: "1", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });
    const second = sendHandlers.send({
      params,
      respond: respond2,
      context,
      req: { type: "req", id: "2", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    resolveDelivery([{ messageId: "m-concurrent", channel: "slack" }]);
    await Promise.all([first, second]);

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledTimes(1);
    expect(respond1).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ runId: "idem-concurrent", messageId: "m-concurrent" }),
      undefined,
      expect.objectContaining({ channel: "slack" }),
    );
    expect(respond2).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ runId: "idem-concurrent", messageId: "m-concurrent" }),
      undefined,
      expect.objectContaining({ cached: true, channel: "slack" }),
    );

    await sendHandlers.send({
      params,
      respond: respond3,
      context,
      req: { type: "req", id: "3", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledTimes(1);
    expect(respond3).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ runId: "idem-concurrent", messageId: "m-concurrent" }),
      undefined,
      { cached: true },
    );
  });
});

describe("gateway poll handling", () => {
  it("trims poll options to pollMaxOptions", async () => {
    const sendPoll = vi.fn().mockResolvedValue({ messageId: "poll-1" });
    pluginMocks.getChannelPlugin.mockReturnValue({
      outbound: { sendPoll, pollMaxOptions: 2 },
    });

    const respond = vi.fn();
    await sendHandlers.poll({
      params: {
        to: "channel:C1",
        question: "Pick one",
        options: ["A", "B", "C"],
        channel: "slack",
        idempotencyKey: "idem-poll-1",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "1", method: "poll" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(sendPoll).toHaveBeenCalledWith(
      expect.objectContaining({
        poll: expect.objectContaining({
          options: ["A", "B"],
        }),
      }),
    );
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ runId: "idem-poll-1", messageId: "poll-1", channel: "slack" }),
      undefined,
      { channel: "slack" },
    );
  });

  it("errors when poll channel lacks sendPoll", async () => {
    pluginMocks.getChannelPlugin.mockReturnValue({ outbound: {} });

    const respond = vi.fn();
    await sendHandlers.poll({
      params: {
        to: "channel:C1",
        question: "Pick one",
        options: ["A", "B"],
        channel: "slack",
        idempotencyKey: "idem-poll-2",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "1", method: "poll" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "unsupported poll channel: slack" }),
    );
  });
});
