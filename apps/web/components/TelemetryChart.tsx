"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Expand, RotateCcw, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { TelemetryTrace } from "@/lib/types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false, loading: () => <div className="chart-skeleton" aria-label="Loading telemetry chart" /> });
const palette = ["#F4F1EA", "#A78BFA", "#D63B45", "#58C7F3"];
interface Channel {
  key: keyof TelemetryTrace["samples"][number];
  label: string;
  unit: string;
  scale?: number;
  tone: "speed" | "throttle" | "brake" | "steering" | "gear" | "rpm";
}

const channels: readonly Channel[] = [
  { key: "speed_kph", label: "Speed", unit: "km/h", tone: "speed" },
  { key: "throttle_0_1", label: "Throttle", unit: "%", scale: 100, tone: "throttle" },
  { key: "brake_0_1", label: "Brake", unit: "%", scale: 100, tone: "brake" },
  { key: "steer_minus1_1", label: "Steering", unit: "input", tone: "steering" },
  { key: "gear", label: "Gear", unit: "gear", tone: "gear" },
  { key: "rpm", label: "RPM", unit: "rpm", tone: "rpm" }
];

export function TelemetryChart({ traces, compact = false }: { traces: TelemetryTrace[]; compact?: boolean }) {
  const [enabled, setEnabled] = useState(() => new Set(channels.map((channel) => channel.key)));
  const [open, setOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const visible = useMemo(() => channels.filter((channel) => enabled.has(channel.key)), [enabled]);
  const option = useMemo(() => buildOption(traces, visible, compact), [traces, visible, compact]);
  const chart = <div className={compact ? "telemetry-chart compact" : "telemetry-chart"}><ReactECharts key={resetKey} option={option} notMerge lazyUpdate style={{ height: compact ? 330 : Math.max(520, visible.length * 118) }} /></div>;
  return (
    <div className="chart-panel">
      <div className="chart-toolbar">
        <div className="channel-toggles" aria-label="Telemetry channels">
          {channels.map((channel) => <button key={channel.key} data-tone={channel.tone} className={enabled.has(channel.key) ? "active" : ""} aria-pressed={enabled.has(channel.key)} onClick={() => setEnabled((current) => { const next = new Set(current); if (next.has(channel.key)) next.delete(channel.key); else next.add(channel.key); return next; })}><span className="channel-shape" />{channel.label}</button>)}
        </div>
        <div className="chart-actions"><button className="icon-button" aria-label="Reset chart zoom" onClick={() => setResetKey((value) => value + 1)}><RotateCcw size={16} /></button><button className="icon-button" aria-label="Open landscape comparison" onClick={() => setOpen(true)}><Expand size={16} /></button></div>
      </div>
      {chart}
      <p className="chart-summary sr-only">Linked distance-aligned telemetry comparison for laps {traces.map((trace) => trace.lap_number).join(", ")}. Use the channel buttons to reveal speed, throttle, brake, steering, gear and RPM. Values are exact in the pointer tooltip.</p>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="chart-dialog" aria-describedby={undefined}><Dialog.Title>Landscape telemetry comparison</Dialog.Title><Dialog.Close className="dialog-close" aria-label="Close comparison"><X /></Dialog.Close>{chart}</Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function buildOption(traces: TelemetryTrace[], visible: Channel[], compact: boolean) {
  const rowHeight = compact ? 210 : 82;
  const topStart = 38;
  const grids = visible.map((_, index) => ({ left: 60, right: 22, top: topStart + index * (rowHeight + 30), height: rowHeight }));
  const series = visible.flatMap((channel, channelIndex) => traces.map((trace, traceIndex) => ({
    name: `Lap ${trace.lap_number} · ${channel.label}`,
    type: "line",
    xAxisIndex: channelIndex,
    yAxisIndex: channelIndex,
    showSymbol: false,
    lineStyle: { width: traceIndex === 0 ? 2.2 : 1.6, color: palette[traceIndex], opacity: 0.95 },
    emphasis: { disabled: true },
    data: trace.samples.map((sample) => [sample.lap_distance_m, Number(sample[channel.key]) * (channel.scale ?? 1)])
  })));
  return {
    animation: false,
    backgroundColor: "transparent",
    color: palette,
    grid: grids,
    legend: { top: 0, textStyle: { color: "#9CA3AF", fontSize: 11 }, data: traces.map((trace, index) => ({ name: `Lap ${trace.lap_number} · ${visible[0]?.label ?? ""}`, itemStyle: { color: palette[index] } })) },
    axisPointer: { link: [{ xAxisIndex: "all" }], lineStyle: { color: "#F4F1EA", width: 1, type: "dashed" }, label: { backgroundColor: "#181B20" } },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" }, confine: true, backgroundColor: "rgba(17,19,23,.98)", borderColor: "#2A2E35", textStyle: { color: "#F4F1EA", fontFamily: "var(--font-geist-mono)" }, valueFormatter: (value: unknown) => typeof value === "number" ? value.toFixed(2) : String(value) },
    dataZoom: [{ type: "inside", xAxisIndex: visible.map((_, index) => index), filterMode: "none" }, { type: "slider", xAxisIndex: visible.map((_, index) => index), bottom: 4, height: 18, borderColor: "#2A2E35", fillerColor: "rgba(214,59,69,.2)", handleStyle: { color: "#D63B45" } }],
    xAxis: visible.map((_, index) => ({ type: "value", gridIndex: index, name: index === visible.length - 1 ? "lap distance (m)" : "", axisLabel: { show: index === visible.length - 1, color: "#747B86" }, axisLine: { lineStyle: { color: "#2A2E35" } }, splitLine: { lineStyle: { color: "rgba(42,46,53,.55)" } }, min: "dataMin", max: "dataMax" })),
    yAxis: visible.map((channel, index) => ({ type: "value", gridIndex: index, name: `${channel.label}\n${channel.unit}`, nameTextStyle: { color: "#9CA3AF", fontSize: 10, align: "right" }, axisLabel: { color: "#747B86", fontSize: 10 }, axisLine: { show: false }, splitLine: { lineStyle: { color: "rgba(42,46,53,.55)" } }, min: channel.key === "steer_minus1_1" ? -1 : undefined, max: channel.scale === 100 ? 100 : undefined })),
    series
  };
}
