import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parseHeader } from "./protocol/parser.js";

export async function inspectCapture(path: string): Promise<object> {
  const buffer = await readFile(path);
  if (extname(path).toLowerCase() === ".jsonl") {
    const lines = buffer.toString("utf8").split(/\r?\n/).filter(Boolean);
    const first = lines[0] ? JSON.parse(lines[0]) : null;
    const last = lines.at(-1) ? JSON.parse(lines.at(-1)!) : null;
    return { format: "normalized-jsonl", samples: lines.length, first, last };
  }
  let offset = 0;
  let packets = 0;
  const packetIds: Record<string, number> = {};
  let truncated = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const packetStart = offset + 12;
    if (packetStart + length > buffer.length) { truncated = true; break; }
    try {
      const header = parseHeader(buffer.subarray(packetStart, packetStart + length));
      packetIds[String(header.packetId)] = (packetIds[String(header.packetId)] ?? 0) + 1;
    } catch {
      packetIds.invalid = (packetIds.invalid ?? 0) + 1;
    }
    packets += 1;
    offset = packetStart + length;
  }
  return { format: "lapsignal-raw-v1", packets, packetIds, bytes: buffer.length, truncated };
}
