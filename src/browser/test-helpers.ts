import { createServer } from "node:net";

let cachedLoopbackSupport: boolean | null = null;

export async function canListenOnLoopback(): Promise<boolean> {
  if (cachedLoopbackSupport !== null) {
    return cachedLoopbackSupport;
  }
  return await new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => {
      server.close(() => {
        cachedLoopbackSupport = false;
        resolve(false);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      server.close((err) => {
        cachedLoopbackSupport = !err;
        resolve(!err);
      });
    });
  });
}
