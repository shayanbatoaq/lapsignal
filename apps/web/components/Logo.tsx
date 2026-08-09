import Link from "next/link";

export function SignalMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="LapSignal circuit waveform mark">
      <defs>
        <linearGradient id="signal-gradient" x1="4" y1="5" x2="36" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5EEBFF" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <path d="M9 11.5C12 7.2 18.6 5.5 24.6 7.4C31.3 9.5 35.3 15 34.2 21.6C33.1 28.6 27.8 34 20.2 33.8C12.9 33.6 6.8 29 6.3 22.7C5.9 18.3 8.2 15 12 15C15.2 15 16.1 17.6 18.5 21.5L21.5 16.4L25.5 24.7L28.2 20.1H34" fill="none" stroke="url(#signal-gradient)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="11.5" r="2.4" fill="#07090D" stroke="#5EEBFF" strokeWidth="1.8" />
    </svg>
  );
}

export function Logo({ compact = false, href = "/" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="logo" aria-label="LapSignal home">
      <SignalMark />
      {!compact && <span>LapSignal</span>}
    </Link>
  );
}
