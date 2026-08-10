import { existsSync, unlinkSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const values = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  values.set(process.argv[index], process.argv[index + 1]);
}
const directory = resolve(values.get("--dir") ?? "apps/web");
const port = Number(values.get("--port") ?? "3000");
const requireFromWeb = createRequire(resolve(directory, "package.json"));
const nextModule = await import(pathToFileURL(requireFromWeb.resolve("next")).href);
const next = nextModule.default;
const app = next({ dev: true, dir: directory, hostname: "127.0.0.1", port });
await app.prepare();
const handler = app.getRequestHandler();
const server = createServer((request, response) => handler(request, response));

await new Promise((resolveReady, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolveReady);
});

let stopping = false;
const stopFile = process.env.LAPSIGNAL_STOP_FILE;
const stopWatcher = setInterval(() => {
  if (stopFile && existsSync(stopFile)) {
    unlinkSync(stopFile);
    void shutdown().then(() => {
      process.exitCode = 0;
    });
  }
}, 400);

async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(stopWatcher);
  await new Promise((resolveClosed) => server.close(resolveClosed));
  await app.close();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
