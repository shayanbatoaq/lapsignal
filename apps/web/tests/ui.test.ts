import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectionState, DemoBanner, EvidenceCard, MetricCard, VersionBadge } from "@/components/UI";

describe("product UI primitives", () => {
  it("renders metric values with context", () => {
    render(createElement(MetricCard, { label: "Consistency", value: "98.4", detail: "robust score" }));
    expect(screen.getByText("98.4")).toBeInTheDocument();
    expect(screen.getByText("robust score")).toBeInTheDocument();
  });

  it("shows exact component version", () => {
    render(createElement(VersionBadge));
    expect(screen.getByText("v0.1.0-alpha.3 · build 3")).toBeInTheDocument();
  });

  it("distinguishes connected and disconnected states in text", () => {
    const { rerender } = render(createElement(ConnectionState, { online: false }));
    expect(screen.getByText("Collector offline")).toBeInTheDocument();
    rerender(createElement(ConnectionState, { online: true }));
    expect(screen.getByText("Collector online")).toBeInTheDocument();
  });

  it("labels seeded content visibly", () => {
    render(createElement(DemoBanner));
    expect(screen.getByText("Demo data")).toBeInTheDocument();
    expect(screen.getByText(/fixed random seed/i)).toBeInTheDocument();
  });

  it("renders finding evidence and confidence without color dependence", () => {
    render(createElement(EvidenceCard, { finding: { id:"finding-1",type:"braking_early",priority:1,severity:"medium",confidence:.86,title:"Brake marker",plain_language:"Recorded difference.",recommended_action:"Repeat the marker.",evidence:[{metric:"brake_onset_distance",value:118.4,unit:"lap_distance_m",reference_value:108.7,delta:9.7,lap_numbers:[4,6],zone_id:"zone-1"}],limitations:[],analysis_version:"0.1.0" } }));
    expect(screen.getByText("High · 86%")).toBeInTheDocument();
    expect(screen.getByText(/laps 4, 6/)).toBeInTheDocument();
  });
});
