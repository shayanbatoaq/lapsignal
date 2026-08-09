export default function Loading() { return <div className="loading-grid" aria-label="Loading LapSignal data">{Array.from({length:8},(_,index)=><div className="loading-card" key={index}/>)}</div>; }
