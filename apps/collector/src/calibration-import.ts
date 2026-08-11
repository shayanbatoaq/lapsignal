import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { F12021Adapter } from "./adapter.js";
import { CircuitCalibrationManager } from "./calibration.js";
import { parseF12021Packet } from "./protocol/parser.js";

export async function calibrateCapture(capturePath: string, dataDirectory: string) {
  const absoluteCapturePath = resolve(capturePath);
  const buffer = await readFile(absoluteCapturePath);
  const adapter = new F12021Adapter();
  const manager = new CircuitCalibrationManager(resolve(dataDirectory));
  let offset = 0;
  let parsedPackets = 0;
  let rejectedPackets = 0;
  while (offset + 12 <= buffer.length) {
    const packetLength = buffer.readUInt32LE(offset);
    const packetStart = offset + 12;
    if (packetStart + packetLength > buffer.length) break;
    try {
      const packet = parseF12021Packet(buffer.subarray(packetStart, packetStart + packetLength));
      parsedPackets += 1;
      const sample = adapter.ingest(packet, Number(buffer.readBigUInt64LE(offset + 4)));
      if (sample) manager.ingest(sample, absoluteCapturePath, false);
    } catch {
      rejectedPackets += 1;
    }
    offset = packetStart + packetLength;
  }
  manager.finalize();
  return {
    parsed_packets: parsedPackets,
    rejected_packets: rejectedPackets,
    calibrations: manager.generatedArtifacts().map((result) => ({
      artifact_path: result.artifactPath,
      created: result.created,
      game_track_id: result.artifact.game_track_id,
      track_id: result.artifact.track_id,
      track_name: result.artifact.track_name,
      track_length_m: result.artifact.track_length_m,
      coverage_ratio: result.artifact.quality.coverage_ratio,
      sample_count: result.artifact.quality.sample_count,
      geometry_checksum: result.artifact.geometry_checksum
    }))
  };
}
