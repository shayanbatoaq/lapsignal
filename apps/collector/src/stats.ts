export class FrameTracker {
  droppedFrames = 0;
  outOfOrderFrames = 0;
  receivedPackets = 0;
  private readonly lastFrames = new Map<number, number>();
  private windowStartedAt = Date.now();
  private windowPackets = 0;

  observe(packetId: number, frameId: number): void {
    this.receivedPackets += 1;
    this.windowPackets += 1;
    const previous = this.lastFrames.get(packetId);
    if (previous != null) {
      if (frameId < previous) this.outOfOrderFrames += 1;
      else if (frameId > previous + 1) this.droppedFrames += frameId - previous - 1;
    }
    if (previous == null || frameId >= previous) this.lastFrames.set(packetId, frameId);
  }

  packetRateHz(now = Date.now()): number {
    const durationSeconds = Math.max(0.001, (now - this.windowStartedAt) / 1000);
    const rate = this.windowPackets / durationSeconds;
    if (durationSeconds >= 2) {
      this.windowStartedAt = now;
      this.windowPackets = 0;
    }
    return Math.round(rate * 10) / 10;
  }
}
