#!/usr/bin/env node
// Local stdio transport for clients without a Sites identity provider.
import http from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";

const origin =
  process.env.DRMUSIC_LOCAL_PREVIEW || "https://drmusic.rockdawn.chatgpt.site";
if (
  process.env.DRMUSIC_LOCAL_PREVIEW &&
  !/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(origin)
) {
  throw new Error("DRMUSIC_LOCAL_PREVIEW must be a loopback origin");
}
const secret = randomBytes(32).toString("hex");
const jobs = new Map();
const serviceTools = JSON.parse(
  readFileSync(new URL("./service-tools.json", import.meta.url), "utf8"),
);
const tools = [
  {
    name: "drm_connect",
    description:
      "取得本機 AI 的 DrMusic 配對連結，請使用者在同一台電腦的瀏覽器確認。",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  ...serviceTools,
];
const toolResult = (message, isError = false) => ({
  content: [{ type: "text", text: message }],
  isError,
});
let lastSeen = 0;
const server = http.createServer(async (req, res) => {
  const json = (status, value) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  if (
    req.headers.host !== "127.0.0.1:" + server.address().port ||
    req.headers.origin !== origin
  )
    return json(403, { error: "Origin rejected" });
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Private-Network": "true",
    });
    return res.end();
  }
  if (req.method !== "POST" || req.headers.authorization !== "Bearer " + secret)
    return json(403, { error: "Pairing required" });
  if (req.url === "/disconnect") {
    lastSeen = 0;
    for (const job of jobs.values())
      job.finish(toolResult("使用者已中斷連線。", true));
    return json(200, {});
  }
  if (req.url === "/next") {
    lastSeen = Date.now();
    const job = [...jobs.values()].find((j) => !j.sent);
    if (job) job.sent = true;
    return json(200, {
      job: job ? { id: job.id, name: job.name, arguments: job.args } : null,
    });
  }
  const job = jobs.get(req.url?.replace("/result/", ""));
  if (!req.url?.startsWith("/result/") || !job?.sent)
    return json(404, { error: "Job expired" });
  try {
    const chunks = [];
    let bytes = 0;
    for await (const part of req) {
      bytes += part.length;
      if (bytes > 2_000_000) return json(413, { error: "Too large" });
      chunks.push(part);
    }
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(result.content))
      return json(400, { error: "Invalid result" });
    job.finish(result);
    return json(200, {});
  } catch {
    return json(400, { error: "Invalid result" });
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const pairLink = () =>
  origin +
  "/pair-ai#" +
  new URLSearchParams({ port: String(server.address().port), key: secret });
// Background browser tabs can wake once a minute while the musician uses their AI.
const isPaired = () => Date.now() - lastSeen < 90_000;
async function handle(message) {
  const { method, params, id } = message;
  if (id === undefined) return;
  function respond(body) {
    process.stdout.write(
      JSON.stringify({ jsonrpc: "2.0", id, ...body }) + "\n",
    );
  }
  if (method === "initialize") {
    const versions = [
      "2026-07-28",
      "2025-11-25",
      "2025-06-18",
      "2025-03-26",
      "2024-11-05",
    ];
    return respond({
      result: {
        protocolVersion: versions.includes(params?.protocolVersion)
          ? params.protocolVersion
          : "2025-11-25",
        capabilities: { tools: {} },
        serverInfo: { name: "DrMusic", version: "1.9.1" },
        instructions:
          "Use drm_connect to pair. For piano transcription use drmusic-score. For printable two-hand numbered notation or saving a private numbered score use drmusic-piano-study. For drum notation and .drmd use drmusic-drum-score. For guitar chord sheets and .drmg use drmusic-guitar-score and the guitar tools. If creating an exchange requires confirmation, give the owner their private confirmation link and wait. Only the owner may accept the rights and takedown notice on the site. Afterward retrieve the exchange link for sharing. Use drm_import_exchange with the full exchange URL or a DRMX1. file to import a friend’s score into the paired account. Use drm_import_package for an account-bound piano file starting with DRM1.",
      },
    });
  }
  if (method === "server/discover")
    return respond({
      result: {
        supportedVersions: ["2026-07-28"],
        capabilities: { tools: {} },
      },
    });
  if (method === "ping") return respond({ result: {} });
  if (method === "tools/list") return respond({ result: { tools } });
  if (method !== "tools/call")
    return respond({ error: { code: -32601, message: "Method not found" } });
  const name = params?.name;
  if (!tools.some((t) => t.name === name))
    return respond({ error: { code: -32602, message: "Unknown tool" } });
  if (name === "drm_connect" || !isPaired())
    return respond({
      result: toolResult(
        isPaired()
          ? "已連接 DrMusic。"
          : "請在同一台電腦的瀏覽器開啟並確認配對：" + pairLink(),
        name !== "drm_connect",
      ),
    });
  if (jobs.size >= 8)
    return respond({ result: toolResult("上傳佇列已滿，請稍後重試。", true) });
  const result = await new Promise((resolve) => {
    const jobId = randomUUID();
    const finish = (value) => {
      clearTimeout(timer);
      jobs.delete(jobId);
      resolve(value);
    };
    const timer = setTimeout(
      () =>
        finish(
          toolResult(
            "未收到網站回覆。請先核對曲庫，再以原本的參數重試。",
            true,
          ),
        ),
      75_000,
    );
    jobs.set(jobId, {
      id: jobId,
      name,
      args: params.arguments || {},
      sent: false,
      finish,
    });
  });
  return respond({ result });
}
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  try {
    if (line.length > 3_000_000) throw Error();
    const message = JSON.parse(line);
    void handle(message).catch(() =>
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: message.id ?? null,
          error: { code: -32603, message: "Bridge error" },
        }) + "\n",
      ),
    );
  } catch {
    process.stdout.write(
      '{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Invalid JSON"}}\n',
    );
  }
});
input.on("close", () => {
  server.close();
  process.exit(0);
});
