type ChatCompletionChunk = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
      tool_calls?: Array<{
        index: number;
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: "stop" | "tool_calls" | "length" | "content_filter" | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

function extractLastUserText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i] as Record<string, unknown> | undefined;
    if (!msg || msg.role !== "user") {
      continue;
    }
    const content = msg.content;
    if (typeof content === "string") {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const text = content
        .filter(
          (c): c is { type: "text"; text: string } =>
            !!c &&
            typeof c === "object" &&
            (c as { type?: unknown }).type === "text" &&
            typeof (c as { text?: unknown }).text === "string",
        )
        .map((c) => c.text)
        .join("\n")
        .trim();
      if (text) {
        return text;
      }
    }
  }
  return "";
}

function extractToolOutput(messages: unknown[]): string {
  for (const msgRaw of messages) {
    const msg = msgRaw as Record<string, unknown> | undefined;
    if (!msg || msg.role !== "tool") {
      continue;
    }
    const content = msg.content;
    if (typeof content === "string") {
      return content;
    }
  }
  return "";
}

function buildToolCallChunks(model: string, toolPath: string): ChatCompletionChunk[] {
  const created = Math.floor(Date.now() / 1000);
  const id = "chatcmpl_test_1";
  const argsJson = JSON.stringify({ path: toolPath });
  return [
    {
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: "call_test_1",
                type: "function",
                function: { name: "read", arguments: argsJson },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    {
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
    },
  ];
}

function buildTextChunks(model: string, text: string): ChatCompletionChunk[] {
  const created = Math.floor(Date.now() / 1000);
  const id = "chatcmpl_test_2";
  return [
    {
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: text },
          finish_reason: null,
        },
      ],
    },
    {
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    },
  ];
}

function decodeBodyText(body: unknown): string {
  if (!body) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString("utf8");
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(body)).toString("utf8");
  }
  return "";
}

async function buildChatCompletionsSse(params: {
  messages: unknown[];
  model?: string;
}): Promise<Response> {
  const messages = Array.isArray(params.messages) ? params.messages : [];
  const toolOutput = extractToolOutput(messages);
  const model = params.model ?? "gpt-oss-120b";

  const chunks = toolOutput
    ? (() => {
        const nonceA = /nonceA=([^\s]+)/.exec(toolOutput)?.[1] ?? "";
        const nonceB = /nonceB=([^\s]+)/.exec(toolOutput)?.[1] ?? "";
        const reply = `${nonceA} ${nonceB}`.trim();
        return buildTextChunks(model, reply);
      })()
    : (() => {
        const prompt = extractLastUserText(messages);
        const quoted = /"([^"]+)"/.exec(prompt)?.[1];
        const toolPath = quoted ?? "package.json";
        return buildToolCallChunks(model, toolPath);
      })();

  const sse = `${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("")}data: [DONE]\n\n`;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sse));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

export function installOllamaCompletionsMock(params?: { baseUrl?: string }) {
  const originalFetch = globalThis.fetch;
  const baseUrl = params?.baseUrl ?? "http://127.0.0.1:11434/v1";
  const completionsUrl = `${baseUrl}/chat/completions`;
  const isCompletionsRequest = (url: string) =>
    url === completionsUrl ||
    url.startsWith(`${completionsUrl}/`) ||
    url.startsWith(`${completionsUrl}?`);

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (isCompletionsRequest(url)) {
      const bodyText =
        typeof (init as { body?: unknown } | undefined)?.body !== "undefined"
          ? decodeBodyText((init as { body?: unknown }).body)
          : input instanceof Request
            ? await input.clone().text()
            : "";
      const parsed = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      const model = typeof parsed.model === "string" ? parsed.model : "gpt-oss-120b";
      return await buildChatCompletionsSse({ messages, model });
    }

    if (url.startsWith(baseUrl)) {
      throw new Error(`unexpected local model request in mock test: ${url}`);
    }

    if (!originalFetch) {
      throw new Error(`fetch is not available (url=${url})`);
    }
    return await originalFetch(input, init);
  };

  (globalThis as unknown as { fetch: unknown }).fetch = fetchImpl;
  return {
    baseUrl,
    restore: () => {
      (globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
    },
  };
}
