"use client";

/**
 * Hub canvas background — matches Railway's project canvas.
 *
 * Two layers:
 *  1. A neutral near-black panel (#0a0a0c) that overrides the slightly
 *     blue-tinged dashboard --background so the Hub feels like its own
 *     canvas surface, the way Railway's project view feels distinct
 *     from the surrounding chrome.
 *  2. A sparse, fine dot grid — 38px spacing, 1px dots at 6% white —
 *     tuned to Railway's pattern (we were too dense and too bright
 *     before).
 *
 * Both layers are pointer-events:none so canvas mousedown still drives
 * the pan handler in the Hub page.
 */
export function CosmicFrame() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 bg-[#0a0a0c]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1.1px)] [background-size:38px_38px]"
        aria-hidden
      />
    </>
  );
}
