import fixture from "./fixtures/car-telemetry.json" with { type: "json" };

export function packetBuffer(
  packetId = fixture.packetId,
  size = fixture.packetSize,
  playerIndex = fixture.playerIndex,
  frameIdentifier = fixture.frameIdentifier
): Buffer {
  const buffer = Buffer.alloc(size);
  buffer.writeUInt16LE(2021, 0);
  buffer.writeUInt8(1, 2);
  buffer.writeUInt8(18, 3);
  buffer.writeUInt8(1, 4);
  buffer.writeUInt8(packetId, 5);
  buffer.writeBigUInt64LE(BigInt(fixture.sessionUid), 6);
  buffer.writeFloatLE(42.5, 14);
  buffer.writeUInt32LE(frameIdentifier, 18);
  buffer.writeUInt8(playerIndex, 22);
  buffer.writeUInt8(255, 23);
  if (packetId === 6 && size >= 1347) {
    const offset = 24 + playerIndex * 60;
    buffer.writeUInt16LE(fixture.speedKph, offset);
    buffer.writeFloatLE(fixture.throttle, offset + 2);
    buffer.writeFloatLE(fixture.steer, offset + 6);
    buffer.writeFloatLE(fixture.brake, offset + 10);
    buffer.writeUInt8(fixture.clutch, offset + 14);
    buffer.writeInt8(fixture.gear, offset + 15);
    buffer.writeUInt16LE(fixture.rpm, offset + 16);
    buffer.writeUInt8(fixture.drs, offset + 18);
    fixture.tyreTemperatures.forEach((value, index) => buffer.writeUInt8(value, offset + 33 + index));
    fixture.surfaceType.forEach((value, index) => buffer.writeUInt8(value, offset + 56 + index));
  }
  return buffer;
}
