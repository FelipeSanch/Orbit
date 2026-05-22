"use client";

/**
 * Hub canvas background — Railway-style uniform dot grid.
 *
 * Pure dots, no glows or star field. The grid is sized to align with
 * our 22px module so cards feel "snapped" without explicit positioning.
 * CSS-only — no layout cost, no animation. The component name is kept
 * for ergonomic reasons but the cosmic gradient layers were removed
 * 2026-05-22 per design feedback (left-edge glow felt out of place
 * against the rest of the dashboard).
 */
export function CosmicFrame() {
  return (
    <div
      className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle,rgba(255,255,255,0.10)_1.2px,transparent_1.4px)] [background-size:22px_22px]"
      aria-hidden
    />
  );
}
