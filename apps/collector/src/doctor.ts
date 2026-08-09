import dgram from "node:dgram";
import { networkInterfaces } from "node:os";

export async function runDoctor(bindAddress: string, port: number, apiUrl: string): Promise<object> {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((address) => address?.family === "IPv4" && !address.internal)
    .map((address) => address!.address);
  const socket = dgram.createSocket("udp4");
  let udpAvailable = false;
  let udpError: string | null = null;
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(port, bindAddress, () => resolve());
    });
    udpAvailable = true;
  } catch (error) {
    udpError = error instanceof Error ? error.message : String(error);
  } finally {
    try { socket.close(); } catch { /* not bound */ }
  }
  let apiOnline = false;
  try {
    apiOnline = (await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch { /* local API is optional during diagnostics */ }
  return {
    udp: { bindAddress, port, available: udpAvailable, error: udpError },
    api: { url: apiUrl, online: apiOnline },
    localIpv4Addresses: addresses,
    nextSteps: [
      "Put the PS4 and laptop on the same local network.",
      `Set F1 2021 UDP IP Address to one of the laptop IPv4 addresses above and UDP Port to ${port}.`,
      "Set UDP Send Rate to 20Hz and UDP Format to 2021.",
      "If packets do not arrive, allow inbound UDP 20777 in Windows Firewall and disable Wi-Fi client isolation."
    ]
  };
}
