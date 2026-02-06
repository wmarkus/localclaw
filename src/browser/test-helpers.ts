import { createServer } from "node:net";

export async function canListenOnLoopback(): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => {
      server.close(() => resolve(false));
    });
    server.listen(0, "127.0.0.1", () => {
      server.close((err) => resolve(!err));
    });
  });
}
