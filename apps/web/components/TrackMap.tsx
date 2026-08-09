export function TrackMap() {
  return (
    <div className="track-map" role="img" aria-label="Normalized distance map with six analysis zones">
      <svg viewBox="0 0 360 220" aria-hidden="true">
        <path className="track-shadow" d="M39 135C18 96 45 46 98 42C140 39 153 70 190 54C237 33 307 46 321 93C335 141 298 181 252 180C211 179 194 151 155 174C100 206 58 170 39 135Z" />
        <path className="track-line" pathLength="100" d="M39 135C18 96 45 46 98 42C140 39 153 70 190 54C237 33 307 46 321 93C335 141 298 181 252 180C211 179 194 151 155 174C100 206 58 170 39 135Z" />
        {["M54 65", "M168 58", "M291 69", "M310 144", "M191 164", "M68 165"].map((position, index) => {
          const [, x, y] = position.match(/M(\d+) (\d+)/) ?? [];
          return <g key={index} transform={`translate(${x} ${y})`}><circle r="11" /><text y="4" textAnchor="middle">{index + 1}</text></g>;
        })}
      </svg>
      <div className="map-legend"><span><i className="map-dot loss" /> Time-loss zone</span><span><i className="map-line" /> Normalized path</span></div>
    </div>
  );
}
