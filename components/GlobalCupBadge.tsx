"use client";

/** SVG badge for the quadrennial Global Cup — globe + trophy on a rift-gold seal. */
export default function GlobalCupBadge({
  size = 14,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block flex-shrink-0 ${className}`}
      aria-label="Global Cup"
      role="img"
    >
      <circle cx="16" cy="16" r="15" fill="#0a1428" stroke="#c8aa6e" strokeWidth="1.5" />
      <circle cx="16" cy="15" r="10.5" stroke="#785a28" strokeWidth="0.6" opacity="0.55" />
      <ellipse
        cx="16"
        cy="15"
        rx="10.5"
        ry="4.2"
        stroke="#c8aa6e"
        strokeWidth="0.65"
        opacity="0.5"
      />
      <path
        d="M5.5 15h21M16 4.5c3.2 2.9 5 6.6 5 10.5s-1.8 7.6-5 10.5M16 4.5c-3.2 2.9-5 6.6-5 10.5s1.8 7.6 5 10.5"
        stroke="#c8aa6e"
        strokeWidth="0.65"
        opacity="0.45"
      />
      <path
        d="M11.5 21.5h9l-1.1-3.2H12.6L11.5 21.5z"
        fill="#785a28"
        stroke="#c8aa6e"
        strokeWidth="0.55"
      />
      <path
        d="M12.8 18.2h6.4l-0.75-2H13.55l-0.75 2z"
        fill="#c8aa6e"
      />
      <path
        d="M13.8 18.2h4.4l-0.55-1.45c-0.25-0.75-1-1.25-1.85-1.25s-1.6 0.5-1.85 1.25L13.8 18.2z"
        fill="#f0e6d2"
        stroke="#c8aa6e"
        strokeWidth="0.45"
      />
      <path d="M12 22.2h8" stroke="#c8aa6e" strokeWidth="1.1" strokeLinecap="round" />
      <text
        x="16"
        y="27.5"
        textAnchor="middle"
        fill="#c8aa6e"
        fontSize="4.5"
        fontFamily="inherit"
        fontWeight="700"
        letterSpacing="0.08em"
        opacity="0.85"
      >
        GC
      </text>
    </svg>
  );
}
