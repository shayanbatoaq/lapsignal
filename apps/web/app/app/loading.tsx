import { SignalMark } from "@/components/Logo";

export default function Loading() {
  return <div className="loading-state" aria-label="Loading LapSignal data"><div className="loading-brand"><SignalMark size={58} decorative /><span>Loading LapSignal</span></div><div className="loading-grid">{Array.from({length:8},(_,index)=><div className="loading-card" key={index}/>)}</div></div>;
}
