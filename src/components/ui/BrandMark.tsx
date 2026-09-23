import { useId } from "react";

// MindBranch brand mark: a sprout of thought — branches with leaves growing
// from a single node (the seed idea). Same geometry as src/app/icon.svg so
// the favicon and in-app mark match.
export function BrandMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const id = `mb-mark-${useId().replace(/:/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a55c4" />
          <stop offset="1" stopColor="#17378f" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <g fill="none" stroke="#fbf6ea" strokeWidth="1.8" strokeLinecap="round">
        <path d="M16 22.5V11.5" />
        <path d="M16 20C16 15.5 12 15 10 12.5" />
        <path d="M16 18C16 14.8 19.8 14.2 21.8 12" />
      </g>
      <g fill="#9fd89a">
        <path d="M16 12.2Q13.2 8.6 16 4.6Q18.8 8.6 16 12.2Z" />
        <path d="M10.6 13.2Q6.4 12.2 5.6 7.8Q9.8 8.6 10.6 13.2Z" />
        <path d="M21.2 12.8Q22.2 8.4 26.6 7.8Q25.6 12 21.2 12.8Z" />
      </g>
      <circle cx="16" cy="23.6" r="3.3" fill="#fbf6ea" />
    </svg>
  );
}
