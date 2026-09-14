export { showcaseCircuitMap } from "./showcase-map";

export const SHOWCASE_TRACK_LENGTH_M = 7003;
export const showcasePlaybackSamples = Array.from({ length: 180 }, (_, index) => {
  const progress = index / 179;
  const cornerLoad = Math.max(0, Math.sin(progress * Math.PI * 14));
  const brake = Math.max(0, Math.sin(progress * Math.PI * 14) - 0.63) / 0.37;
  const throttle = Math.max(0, Math.min(1, 1 - brake * 1.2 - cornerLoad * 0.31));
  const speed = Math.max(76, 334 - cornerLoad * 145 - brake * 34);
  return {
    schema_version: 1, game_id: "f1_2021", packet_format: 2021, track_id: "spa-francorchamps",
    track_name: "Spa-Francorchamps", track_length_m: SHOWCASE_TRACK_LENGTH_M, lap_number: 7,
    lap_distance_m: Math.round(progress * SHOWCASE_TRACK_LENGTH_M), current_lap_time_ms: Math.round(progress * 112840),
    speed_kph: Math.round(speed), throttle_0_1: Number(throttle.toFixed(3)), brake_0_1: Number(Math.min(1, brake).toFixed(3)),
    steer_minus1_1: Number((Math.sin(progress * Math.PI * 14) * 0.7).toFixed(3)), gear: Math.max(2, Math.min(8, Math.round(speed / 45))),
    rpm: Math.round(8200 + Math.max(0, speed - 100) * 22), team_name: "Apex Dynamics", car_id: "showcase-open-wheel-01",
    car_number: 27, formula: "Modern open wheel", car_class: "Modern open wheel", session_type: "Time Trial", weather: "Clear"
  };
});
