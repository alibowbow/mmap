// MindForge brand mark: a node-spark — three thoughts being forged into one.
// Same geometry as src/app/icon.svg so the favicon and in-app mark match.
export function BrandMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="mf-mark-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#mf-mark-g)" />
      <circle cx="11" cy="16" r="3.2" fill="#fff" />
      <circle cx="22" cy="9.5" r="2.4" fill="#fff" opacity="0.9" />
      <circle cx="22" cy="22.5" r="2.4" fill="#fff" opacity="0.9" />
      <path
        d="M13.6 14.6 19.8 10.4M13.6 17.4 19.8 21.6"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}
