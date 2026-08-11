import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packRoot = path.join(root, "data", "circuit-maps");
const outputRoot = path.join(root, "artifacts", "qa", "circuit-maps");
const manifest = JSON.parse(fs.readFileSync(path.join(packRoot, "manifest.json"), "utf8"));
const width = 1440, height = 2160, columns = 4, rows = 6, gap = 18, margin = 30;
const cardWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
const cardHeight = (height - margin * 2 - gap * (rows - 1)) / rows;
const cards = manifest.entries.map((entry, index) => card(entry, index)).join("\n");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#071019"/>
<style>.name{fill:#f4f8fb;font:700 18px Inter,system-ui}.meta{fill:#8fa6b7;font:12px Inter,system-ui}.badge{fill:#8cf6cf;font:700 11px Inter,system-ui;letter-spacing:.6px}.track{fill:none;stroke:#dfeaf1;stroke-width:5;stroke-linejoin:round;stroke-linecap:round}.start{fill:#ff4664}.arrow{fill:none;stroke:#00dca4;stroke-width:4;stroke-linecap:round}.card{fill:#101c29;stroke:#233345;stroke-width:1}</style>
${cards}</svg>\n`;
fs.mkdirSync(outputRoot, { recursive: true });
const svgPath = path.join(outputRoot, "all-24-contact-sheet.svg");
fs.writeFileSync(svgPath, svg);
const htmlPath = path.join(outputRoot, "all-24-contact-sheet.html");
fs.writeFileSync(htmlPath, `<!doctype html><style>html,body{margin:0;background:#071019}img{display:block;width:1440px;height:2160px}</style><img src="./all-24-contact-sheet.svg" alt="LapSignal F1 2021 circuit map contact sheet">`);
console.log(svgPath);

function card(entry, index) {
  const sourcePath = path.resolve(packRoot, entry.asset_path);
  const asset = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const col = index % columns, row = Math.floor(index / columns);
  const x = margin + col * (cardWidth + gap), y = margin + row * (cardHeight + gap);
  const mapBox = { x: x + 22, y: y + 50, width: cardWidth - 44, height: cardHeight - 142 };
  const points = fit(asset.points, mapBox);
  const d = points.map((point, pointIndex) => `${pointIndex ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ") + " Z";
  const start = points[0], ahead = points[Math.max(2, Math.floor(points.length * 0.025))];
  const badge = entry.representation === "telemetry_seed" ? "TELEMETRY SEED" : "PACKAGED STATIC";
  const source = entry.representation === "telemetry_seed" ? "LapSignal normalized game telemetry" : "F1DB · CC BY 4.0";
  return `<g><rect class="card" x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="12"/>
  <text class="name" x="${x + 18}" y="${y + 29}">${entry.game_track_id} · ${escapeXml(entry.track_name)}</text>
  <path class="track" d="${d}"/><line class="arrow" x1="${start.x}" y1="${start.y}" x2="${ahead.x}" y2="${ahead.y}"/><circle class="start" cx="${start.x}" cy="${start.y}" r="6"/>
  <text class="badge" x="${x + 18}" y="${y + cardHeight - 63}">${badge}</text>
  <text class="meta" x="${x + 18}" y="${y + cardHeight - 47}">${escapeXml(source)} · ${entry.expected_track_length_m} m · ${escapeXml(entry.direction)}</text>
  ${fittedText(entry.layout_fingerprint, x + 18, y + cardHeight - 31, cardWidth - 36)}
  ${fittedText(entry.layout_version, x + 18, y + cardHeight - 15, cardWidth - 36)}</g>`;
}

function fit(points, box) {
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(box.width / (maxX - minX), box.height / (maxY - minY));
  const width = (maxX - minX) * scale, height = (maxY - minY) * scale;
  return points.map((point) => ({ x: box.x + (box.width - width) / 2 + (point.x - minX) * scale, y: box.y + (box.height - height) / 2 + (point.y - minY) * scale }));
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function fittedText(value, x, y, maxWidth) {
  const text = escapeXml(value);
  const sizing = text.length > 42 ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : "";
  return `<text class="meta" x="${x}" y="${y}"${sizing}>${text}</text>`;
}
