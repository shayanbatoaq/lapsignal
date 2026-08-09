"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Expand, RotateCcw, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { TelemetryTrace } from "@/lib/types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false, loading: () => <div className="chart-skeleton" aria-label="Loading telemetry chart" /> });
const palette = ["#5EEBFF", "#8B5CF6", "#F5B942", "#2DCC70"];
interface Channel {
  key: keyof TelemetryTrace["samples"][number];
  label: string;
  unit: string;
  scale?: number;
}

const channels: readonly Channel[] = [
  { key: "speed_kph", label: "Speed", unit: "km/h" },
  { key: "throttle_0_1", label: "Throttle", unit: "%", scale: 100 },
  { key: "brake_0_1", label: "Brake", unit: "%", scale: 100 },
  { key: "steer_minus1_1", label: "Steering", unit: "input" },
  { key: "gear", label: "Gear", unit: "gear" },
  { key: "rpm", label: "RPM", unit: "rpm" }
];

export function TelemetryChart({ traces, compact = false }: { traces: TelemetryTrace[]; compact?: boolean }) {
  const [enabled, setEnabled] = useState(() => new Set(channels.map((channel) => channel.key)));
  const [open, setOpen] = useState(false);
  const visible = channels.filter((channel) => enabled.has(channel.key));
  const option = useMemo(() => buildOption(traces, visible, compact), [traces, visible, compact]);
  const chart = <div className={compact ? "telemetry-chart compact" : "telemetry-chart"}><ReactECharts option={option} notMerge lazyUpdate style={{ height: compact ? 330 : Math.max(520, visible.length * 118) }} /></div>;
  return (
    <div className="chart-panel">
      <div className="chart-toolbar">
        <div className="channel-toggles" aria-label="Telemetry channels">
          {channels.map((channel) => <button key={channel.key} className={enabled.has(channel.key) ? "active" : ""} aria-pressed={enabled.has(channel.key)} onClick={() => setEnabled((current) => { const next = new Set(current); if (next.has(channel.key)) next.delete(channel.key); else next.add(channel.key); return next; })}><span className="channel-shape" />{channel.label}</button>)}
        </div>
        <div className="chart-actions"><button className="icon-button" aria-label="Reset chart zoom"><RotateCcw size={16} /></button><button className="icon-button" aria-label="Open landscape comparison" onClick={() => setOpen(true)}><Expand size={16} /></button></div>
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
    legend: { top: 0, textStyle: { color: "#97A3B6", fontSize: 11 }, data: traces.map((trace, index) => ({ name: `Lap ${trace.lap_number} · ${visible[0]?.label ?? ""}`, itemStyle: { color: palette[index] } })) },
    axisPointer: { link: [{ xAxisIndex: "all" }], lineStyle: { color: "#F5F7FA", width: 1, type: "dashed" }, label: { backgroundColor: "#121824" } },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" }, confine: true, backgroundColor: "rgba(13,17,24,.96)", borderColor: "#243044", textStyle: { color: "#F5F7FA", fontFamily: "var(--font-mono)" }, valueFormatter: (value: unknown) => typeof value === "number" ? value.toFixed(2) : String(value) },
    dataZoom: [{ type: "inside", xAxisIndex: visible.map((_, index) => index), filterMode: "none" }, { type: "slider", xAxisIndex: visible.map((_, index) => index), bottom: 4, height: 18, borderColor: "#243044", fillerColor: "rgba(41,168,255,.15)", handleStyle: { color: "#29A8FF" } }],
    xAxis: visible.map((_, index) => ({ type: "value", gridIndex: index, name: index === visible.length - 1 ? "lap distance (m)" : "", axisLabel: { show: index === visible.length - 1, color: "#657187" }, axisLine: { lineStyle: { color: "#243044" } }, splitLine: { lineStyle: { color: "rgba(36,48,68,.45)" } }, min: "dataMin", max: "dataMax" })),
    yAxis: visible.map((channel, index) => ({ type: "value", gridIndex: index, name: `${channel.label}\n${channel.unit}`, nameTextStyle: { color: "#97A3B6", fontSize: 10, align: "right" }, axisLabel: { color: "#657187", fontSize: 10 }, axisLine: { show: false }, splitLine: { lineStyle: { color: "rgba(36,48,68,.45)" } }, min: channel.key === "steer_minus1_1" ? -1 : undefined, max: channel.scale === 100 ? 100 : undefined })),
    series
  };
}
