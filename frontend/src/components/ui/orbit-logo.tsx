interface OrbitLogoProps {
  size?: number;
  className?: string;
}

export function OrbitLogo({ size = 32, className = "" }: OrbitLogoProps) {
  // Stable id-suffix per-render isn't needed because all instances on the
  // page can share the same gradient defs (they're SVG-scoped to their tree).
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient
          id="orbit-core"
          cx="0.4"
          cy="0.35"
          r="0.7"
        >
          <stop offset="0%" stopColor="#a5b4fc" />
          <stop offset="55%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#312e81" />
        </radialGradient>
        <linearGradient
          id="orbit-ring"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.95" />
          <stop offset="50%" stopColor="#818cf8" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient
          id="orbit-ring-back"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {/* Back half of the ring (drawn behind the planet) */}
      <ellipse
        cx="32"
        cy="32"
        rx="28"
        ry="9"
        transform="rotate(-22 32 32)"
        stroke="url(#orbit-ring-back)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="60 200"
        strokeDashoffset="-50"
      />

      {/* Planet body */}
      <circle cx="32" cy="32" r="14" fill="url(#orbit-core)" />

      {/* Soft inner highlight */}
      <circle
        cx="27"
        cy="27"
        r="4"
        fill="white"
        opacity="0.35"
      />

      {/* Front half of the ring (drawn over the planet) */}
      <ellipse
        cx="32"
        cy="32"
        rx="28"
        ry="9"
        transform="rotate(-22 32 32)"
        stroke="url(#orbit-ring)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="120 200"
        strokeDashoffset="60"
      />

      {/* Tiny accent moon */}
      <circle cx="51" cy="14" r="2.2" fill="#a5b4fc" opacity="0.9" />
    </svg>
  );
}
