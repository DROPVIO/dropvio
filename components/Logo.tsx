const CARD_PATH =
  "M40 16A8 8 0 0 1 48 24L48 38A8 8 0 0 1 40 46L16 46A8 8 0 0 1 8 38L8 24A8 8 0 0 1 16 16L28 16";
const TREND_PATH = "M17 39L24 30L29 34L35 17L46 4";

export default function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Dropvio"
      className={className}
    >
      <path d={CARD_PATH} stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={TREND_PATH} stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="13" y="22" width="7" height="4.5" rx="2.25" fill="currentColor" />
    </svg>
  );
}
