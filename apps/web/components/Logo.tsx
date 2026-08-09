import Link from "next/link";

export function SignalMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 2 / 3)} viewBox="0 0 48 32" role="img" aria-label="LapSignal timing line mark">
      <path d="M2 18H10L14 9L19 25L24 14L28 18H34L38 7L43 18H46" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" />
      <path d="M2 26H46" fill="none" stroke="currentColor" strokeOpacity=".28" strokeWidth="1" />
      <circle cx="38" cy="7" r="2.6" fill="#08090B" stroke="currentColor" strokeWidth="1.6" />
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
