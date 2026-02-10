import net from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const runCommandWithTimeoutMock = vi.fn();

vi.mock("../process/exec.js", () => ({
  runCommandWithTimeout: (...args: unknown[]) => runCommandWithTimeoutMock(...args),
}));

const describeUnix = process.platform === "win32" ? describe.skip : describe;

describeUnix("inspectPortUsage", () => {
  beforeEach(() => {
    runCommandWithTimeoutMock.mockReset();
  });

  it("reports busy when lsof is missing but loopback listener exists", async () => {
    const server = net.createServer();
    const port = await listenLoopback(server);
    if (!port) {
      return;
    }

    runCommandWithTimeoutMock.mockRejectedValueOnce(
      Object.assign(new Error("spawn lsof ENOENT"), { code: "ENOENT" }),
    );

    try {
      const { inspectPortUsage } = await import("./ports-inspect.js");
      const result = await inspectPortUsage(port);
      expect(result.status).toBe("busy");
      expect(result.errors?.some((err) => err.includes("ENOENT"))).toBe(true);
    } finally {
      if (server.listening) {
        server.close();
      }
    }
  });
});
