// MindBranch brand mark: a sprout of thought rising from an open book — the
// branch grows two leaves and ends in a node. Same geometry as
// src/app/icon.svg so the favicon and in-app mark match.
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
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
    >
      <rect width="64" height="64" rx="16" fill="#1d3f9e" />
      <path
        d="M32 47C26 43 18 42 11 43.5V36C18 34.5 26 35.5 32 39.5C38 35.5 46 34.5 53 36V43.5C46 42 38 43 32 47Z"
        fill="#f7f1e3"
      />
      <path d="M32 47V39.5" stroke="#1d3f9e" strokeWidth="1.6" />
      <path d="M32 38V22" stroke="#f7f1e3" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M32 30C31 23 25 19.5 18.5 20.5C19.5 27 25 30.5 32 30Z" fill="#8fd49a" />
      <path d="M32 26C33 19.5 38.5 15.5 45.5 16C44.5 23 39 26.5 32 26Z" fill="#8fd49a" />
      <circle cx="32" cy="16.5" r="3.3" fill="#f7f1e3" />
    </svg>
  );
}
