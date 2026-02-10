import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { VoiceCallConfig, VoiceCallRecord } from "./types.js";
import {
  buildRejectTwiml,
  buildTwiml,
  resolvePublicWebhookUrl,
  resolveStreamUrl,
  validateTwilioSignature,
} from "./twilio.js";

const DEFAULT_PORT = 3334;
const DEFAULT_BIND = "0.0.0.0";
const DEFAULT_WEBHOOK_PATH = "/voice/webhook";
const DEFAULT_STREAM_PATH = "/voice/stream";

export type VoiceCallServerHandlers = {
  onInboundCall: (params: {
    callSid: string;
    from: string;
    to: string;
    payload: Record<string, string>;
  }) => void;
  onStatus: (params: { callSid: string; status?: string; payload: Record<string, string> }) => void;
  onStreamStart?: (params: { callSid?: string; streamSid?: string }) => void;
  onStreamStop?: (params: { callSid?: string; streamSid?: string }) => void;
  onStreamMedia?: (params: { callSid?: string; streamSid?: string; payload: string }) => void;
};

export type VoiceCallServer = {
  server: Server;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  sendStreamAudio: (callSid: string, audio: Buffer) => boolean;
  hasStream: (callSid: string) => boolean;
};

type StreamSession = {
  callSid?: string;
  streamSid?: string;
  ws: WebSocket;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function parseFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const parsed: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (!parsed[key]) {
      parsed[key] = value;
    }
  }
  return parsed;
}

function resolveRequestUrl(req: IncomingMessage, config: VoiceCallConfig): string | null {
  const publicUrl = resolvePublicWebhookUrl(config);
  if (publicUrl) {
    try {
      const resolved = new URL(req.url ?? "", publicUrl);
      return resolved.toString();
    } catch {
      return publicUrl;
    }
  }
  const host = req.headers.host;
  if (!host) {
    return null;
  }
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  return `${proto}://${host}${req.url ?? ""}`;
}

function normalizePath(path?: string): string {
  if (!path) {
    return "";
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function isAllowedInbound(config: VoiceCallConfig, from: string): boolean {
  if (config.inboundPolicy !== "allowlist") {
    return false;
  }
  const allow = config.allowFrom ?? [];
  if (allow.length === 0) {
    return false;
  }
  return allow.includes(from);
}

export function createVoiceCallServer(params: {
  config: VoiceCallConfig;
  handlers: VoiceCallServerHandlers;
  logger: { info: (message: string) => void; warn: (message: string) => void };
}): VoiceCallServer {
  const webhookPath = normalizePath(params.config.serve?.path ?? DEFAULT_WEBHOOK_PATH);
  const streamPath = normalizePath(params.config.streaming?.streamPath ?? DEFAULT_STREAM_PATH);
  const port = params.config.serve?.port ?? DEFAULT_PORT;
  const bind = params.config.serve?.bind ?? DEFAULT_BIND;
  const streamUrl = resolveStreamUrl(params.config);

  const sessions = new Map<string, StreamSession>();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.statusCode = 404;
      res.end();
      return;
    }

    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== webhookPath) {
      res.statusCode = 404;
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }

    const body = await readBody(req);
    const payload = parseFormBody(body);

    const signature = req.headers["x-twilio-signature"] as string | undefined;
    const urlForSignature = resolveRequestUrl(req, params.config);
    const authToken = params.config.twilio?.authToken;
    const skipSignature = params.config.twilio?.skipSignatureVerification === true;
    if (!skipSignature && authToken) {
      if (!urlForSignature) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Missing request URL for signature validation");
        return;
      }
      const valid = validateTwilioSignature({
        url: urlForSignature,
        params: payload,
        signature,
        authToken,
      });
      if (!valid) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Invalid signature");
        return;
      }
    }

    const callSid = payload.CallSid ?? payload.callSid;
    const direction = payload.Direction ?? payload.direction;
    const callStatus = payload.CallStatus ?? payload.callStatus;

    if (callSid) {
      params.handlers.onStatus({ callSid, status: callStatus, payload });
    }

    if (direction && direction.startsWith("inbound") && callSid) {
      const from = payload.From ?? "";
      const to = payload.To ?? "";
      const allowInbound = isAllowedInbound(params.config, from);
      if (params.config.inboundPolicy !== "allowlist" || !allowInbound) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/xml; charset=utf-8");
        res.end(buildRejectTwiml());
        return;
      }

      params.handlers.onInboundCall({ callSid, from, to, payload });
      const greeting = params.config.inboundGreeting ?? "Hello.";
      const twiml = buildTwiml({
        message: greeting,
        mode: "conversation",
        streamUrl: streamUrl ?? undefined,
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/xml; charset=utf-8");
      res.end(twiml);
      return;
    }

    res.statusCode = 200;
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== streamPath) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    const session: StreamSession = { ws };

    ws.on("message", (data) => {
      let payload: Record<string, unknown> | null = null;
      try {
        payload = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!payload || typeof payload.event !== "string") {
        return;
      }

      if (payload.event === "start") {
        const start = payload.start as Record<string, unknown> | undefined;
        const callSid = typeof start?.callSid === "string" ? start.callSid : undefined;
        const streamSid = typeof start?.streamSid === "string" ? start.streamSid : undefined;
        session.callSid = callSid;
        session.streamSid = streamSid;
        if (callSid) {
          sessions.set(callSid, session);
        }
        params.handlers.onStreamStart?.({ callSid, streamSid });
        return;
      }

      if (payload.event === "media") {
        const media = payload.media as Record<string, unknown> | undefined;
        const audioPayload = typeof media?.payload === "string" ? media.payload : undefined;
        params.handlers.onStreamMedia?.({
          callSid: session.callSid,
          streamSid: session.streamSid,
          payload: audioPayload ?? "",
        });
        return;
      }

      if (payload.event === "stop") {
        params.handlers.onStreamStop?.({
          callSid: session.callSid,
          streamSid: session.streamSid,
        });
        if (session.callSid) {
          sessions.delete(session.callSid);
        }
      }
    });

    ws.on("close", () => {
      if (session.callSid) {
        sessions.delete(session.callSid);
      }
    });
  });

  const start = (): Promise<void> => {
    return new Promise((resolve) => {
      server.listen(port, bind, () => {
        params.logger.info(`voice-call: webhook server listening on ${bind}:${port}${webhookPath}`);
        resolve();
      });
    });
  };

  const stop = (): Promise<void> => {
    return new Promise((resolve) => {
      wss.close(() => {
        server.close(() => resolve());
      });
    });
  };

  const hasStream = (callSid: string): boolean => sessions.has(callSid);

  const sendStreamAudio = (callSid: string, audio: Buffer): boolean => {
    const session = sessions.get(callSid);
    if (!session || session.ws.readyState !== session.ws.OPEN || !session.streamSid) {
      return false;
    }
    const payload = audio.toString("base64");
    session.ws.send(
      JSON.stringify({
        event: "media",
        streamSid: session.streamSid,
        media: { payload },
      }),
    );
    return true;
  };

  return {
    server,
    start,
    stop,
    sendStreamAudio,
    hasStream,
  };
}

export function updateRecordFromStatus(record: VoiceCallRecord, status?: string) {
  if (!status) {
    return;
  }
  const normalized = status.toLowerCase();
  if (["completed", "canceled", "failed", "busy", "no-answer"].includes(normalized)) {
    record.status = "ended";
  }
  record.updatedAtMs = Date.now();
}
