export class FrameTracker {
  outOfOrderFrames = 0;
  receivedPackets = 0;
  private readonly lastFrames = new Map<number, number>();
  private readonly receivedAt: number[] = [];
  private sessionUid: string | null = null;

  observe(sessionUid: string, packetId: number, frameId: number, now = Date.now()): void {
    if (this.sessionUid !== sessionUid) {
      this.sessionUid = sessionUid;
      this.lastFrames.clear();
      this.receivedAt.length = 0;
      this.outOfOrderFrames = 0;
      this.receivedPackets = 0;
    }
    this.receivedPackets += 1;
    this.receivedAt.push(now);
    while (this.receivedAt[0] != null && this.receivedAt[0] < now - 5000) this.receivedAt.shift();
    const previous = this.lastFrames.get(packetId);
    if (previous != null && frameId < previous) this.outOfOrderFrames += 1;
    if (previous == null || frameId >= previous) this.lastFrames.set(packetId, frameId);
  }

  packetRateHz(now = Date.now()): number {
    while (this.receivedAt[0] != null && this.receivedAt[0] < now - 5000) this.receivedAt.shift();
    if (this.receivedAt.length < 2) return 0;
    const first = this.receivedAt[0] ?? now;
    const rate = (this.receivedAt.length - 1) / Math.max(0.001, (now - first) / 1000);
    return Math.round(rate * 10) / 10;
  }
}
