# PS4 and F1 2021 telemetry setup

These steps match EA's published PlayStation telemetry labels for F1 2021.

1. Connect the PS4 and Windows laptop to the same local network.
2. On the laptop, open PowerShell and run `ipconfig`.
3. Find the active Wi-Fi or Ethernet adapter's **IPv4 Address**. Do not use a WSL, VPN, Bluetooth, or disconnected adapter address.
4. Start the application with `pnpm dev:app-start` and, in a second PowerShell window, run `pnpm collector:listen`.
5. In F1 2021 on PS4, open **Game Options → Settings → Telemetry Settings**.
6. Set **UDP Telemetry** to **On**.
7. Set **UDP Broadcast Mode** to **Off** and enter the laptop IPv4 address in **UDP IP Address**.
8. Set **UDP Port** to **20777**.
9. Set **UDP Send Rate** to **20Hz** for the first test.
10. Set **UDP Format** to **2021**.
11. Enter an on-track session. The Live page should change from disconnected after the first supported packets arrive.

A new installation starts with an empty session library. LapSignal does not generate a substitute session while the collector is offline; completed sessions appear only after received telemetry is finalized.

Run diagnostics at any time:

```powershell
pnpm --filter @lapsignal/collector start doctor
```

## Windows Firewall

When Windows prompts, allow Node.js on the current private network. If no prompt appeared, add an inbound rule in **Windows Defender Firewall with Advanced Security** for UDP local port `20777`, limited to Private profiles. Avoid disabling the firewall globally.

## Troubleshooting

- **Wrong IP:** re-run `ipconfig` after changing Wi-Fi. The address can change after a router restart.
- **Client isolation:** some guest Wi-Fi networks prevent devices from talking to each other. Use the same non-guest LAN or Ethernet.
- **VPN or virtual adapter:** disconnect the VPN and avoid WSL/Hyper-V addresses. Run the collector natively in Windows.
- **Port already in use:** `doctor` reports whether the bind succeeds. Stop the other listener or explicitly choose the matching alternate port in both places.
- **Format ignored:** the collector deliberately rejects formats other than 2021. Confirm **UDP Format: 2021**.
- **API offline:** UDP capture can continue and the bounded queue retries delivery, but the Live web page requires the API at `http://localhost:8000`.
- **Broadcast confusion:** direct IP with Broadcast Mode off is easiest. If using broadcast deliberately, the router and Windows network profile must permit it.

Source for the exact setting labels and defaults: [EA F1 2021 PS4 telemetry accessibility resource](https://www.ea.com/able/resources/f1-2021/ps4/telemetry).

LapSignal is independent and is not affiliated with or endorsed by EA, Codemasters, Formula 1, PlayStation, or any racing organization.
