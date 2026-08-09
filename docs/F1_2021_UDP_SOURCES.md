# F1 2021 UDP protocol sources

## Settings and operating behavior

EA's public [F1 2021 PS4 telemetry resource](https://www.ea.com/able/resources/f1-2021/ps4/telemetry) was used to verify the in-game labels **UDP Telemetry**, **UDP Broadcast Mode**, **UDP IP Address**, **UDP Port**, **UDP Send Rate**, and **UDP Format**, including port 20777, 20 Hz, and 2021 format guidance.

## Binary layouts

The binary structure reference used for the adapter is the `f1-2021-udp` source in [raweceek-temeletry/f1-2021-udp](https://github.com/raweceek-temeletry/f1-2021-udp). Its repository declares the MIT License, which permits use and adaptation with preservation of its copyright and license notice. The reference was inspected rather than installed as a runtime dependency.

The local parser implements packed, little-endian reads independently and validates before packet-specific access:

- 24-byte common header.
- Packet format must equal `2021`.
- Packet version must be supported.
- Packet ID must be known and the complete published packet length must be present.
- Session UID, overall frame ID, secondary-player index, and player-car index come from the common header.

Published packet lengths used by the parser/test fixtures are:

| ID | Packet | Bytes |
| ---: | --- | ---: |
| 0 | Motion | 1464 |
| 1 | Session | 625 |
| 2 | Lap data | 970 |
| 3 | Event | 36 |
| 4 | Participants | 1257 |
| 5 | Car setups | 1102 |
| 6 | Car telemetry | 1347 |
| 7 | Car status | 1058 |
| 8 | Final classification | 839 |
| 9 | Lobby info | 1191 |
| 10 | Car damage | 882 |
| 11 | Session history | 1155 |

LapSignal currently extracts the fields needed from motion, session, lap data, event, participants, car telemetry, car status, final classification, and damage packets. Setup, lobby, and session-history IDs are recognized by length but are not normalized into live samples. Unknown IDs and versions are logged and ignored.

## Verification

`apps/collector/tests/parser.test.ts` covers valid headers, player and secondary-player indices, malformed/truncated packets, wrong format, unknown packet IDs, supported packet sizes, frame accounting, recording, and reconnect behavior. The replay fixture is a LapSignal-normalized synthetic fixture, not copied game or publisher data.

No publisher code, logos, car liveries, screenshots, or protocol text is redistributed in this repository. If this adapter is distributed beyond the private prototype, re-review the upstream MIT notice and include any attribution required by the exact referenced revision.
