import net from "node:net";
import { describe, expect, it, vi } from "vitest";
import {
  buildPortHints,
  classifyPortListener,
  ensurePortAvailable,
  formatPortDiagnostics,
  handlePortError,
  PortInUseError,
} from "./ports.js";

function isLoopbackBindPermissionError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === "EPERM" || code === "EACCES";
}

async function listenLoopback(server: net.Server, timeoutMs = 1000): Promise<number | null> {
  try {
    return await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("listen timeout"));
      }, timeoutMs);
      const onError = (err: unknown) => {
        cleanup();
        reject(err);
      };
      const onListening = () => {
        cleanup();
        const addr = server.address() as net.AddressInfo;
        resolve(addr.port);
      };
      const cleanup = () => {
        clearTimeout(timeout);
        server.off("error", onError);
        server.off("listening", onListening);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(0, "127.0.0.1");
    });
  } catch (err) {
    if (isLoopbackBindPermissionError(err) || String(err).includes("listen timeout")) {
      return null;
    }
    throw err;
  }
}

describe("ports helpers", () => {
  it("ensurePortAvailable rejects when port busy", async () => {
    const server = net.createServer();
    const port = await listenLoopback(server);
    if (!port) {
      return;
    }
    await expect(ensurePortAvailable(port)).rejects.toBeInstanceOf(PortInUseError);
    if (server.listening) {
      server.close();
    }
  });

  it("handlePortError exits nicely on EADDRINUSE", async () => {
    const runtime = {
      error: vi.fn(),
      log: vi.fn(),
      exit: vi.fn() as unknown as (code: number) => never,
    };
    await handlePortError({ code: "EADDRINUSE" }, 1234, "context", runtime).catch(() => {});
    expect(runtime.error).toHaveBeenCalled();
    expect(runtime.exit).toHaveBeenCalledWith(1);
  });

  it("classifies ssh and gateway listeners", () => {
    expect(
      classifyPortListener({ commandLine: "ssh -N -L 18789:127.0.0.1:18789 user@host" }, 18789),
    ).toBe("ssh");
    expect(
      classifyPortListener(
        {
          commandLine: "node /Users/me/Projects/openclaw/dist/entry.js gateway",
        },
        18789,
      ),
    ).toBe("gateway");
  });

  it("formats port diagnostics with hints", () => {
    const diagnostics = {
      port: 18789,
      status: "busy" as const,
      listeners: [{ pid: 123, commandLine: "ssh -N -L 18789:127.0.0.1:18789" }],
      hints: buildPortHints([{ pid: 123, commandLine: "ssh -N -L 18789:127.0.0.1:18789" }], 18789),
    };
    const lines = formatPortDiagnostics(diagnostics);
    expect(lines[0]).toContain("Port 18789 is already in use");
    expect(lines.some((line) => line.includes("SSH tunnel"))).toBe(true);
  });
});
