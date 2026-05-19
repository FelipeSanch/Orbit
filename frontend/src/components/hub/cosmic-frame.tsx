"use client";

/**
 * Decorative cosmic edges that frame the workspace canvas without
 * distracting from it. Two painterly gradient layers on the left and right
 * edges suggest a hand-drawn nebula scene; the center stays clean for cards.
 */
export function CosmicFrame() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Star field across the whole canvas, barely there */}
      <div className="absolute inset-0 opacity-[0.10] [background-image:radial-gradient(circle_at_18%_22%,white_0.5px,transparent_1px),radial-gradient(circle_at_82%_15%,white_0.5px,transparent_1px),radial-gradient(circle_at_64%_70%,white_0.5px,transparent_1px),radial-gradient(circle_at_8%_60%,white_0.5px,transparent_1px),radial-gradient(circle_at_92%_80%,white_0.5px,transparent_1px),radial-gradient(circle_at_42%_38%,white_0.5px,transparent_1px),radial-gradient(circle_at_27%_88%,white_0.5px,transparent_1px),radial-gradient(circle_at_75%_50%,white_0.5px,transparent_1px),radial-gradient(circle_at_55%_12%,white_0.5px,transparent_1px),radial-gradient(circle_at_35%_70%,white_0.5px,transparent_1px)] [background-size:520px_520px]" />

      {/* Left painterly nebula */}
      <div
        className="absolute left-0 top-0 h-full w-[14%]"
        style={{
          background:
            "radial-gradient(ellipse 70% 100% at 0% 50%, rgba(99,102,241,0.07) 0%, rgba(99,102,241,0.03) 40%, transparent 70%)",
        }}
      />

      {/* Right painterly nebula */}
      <div
        className="absolute right-0 top-0 h-full w-[14%]"
        style={{
          background:
            "radial-gradient(ellipse 70% 100% at 100% 50%, rgba(217,70,239,0.04) 0%, rgba(99,102,241,0.02) 40%, transparent 70%)",
        }}
      />

      {/* Workspace dotted grid — uniform, visible like Railway's */}
      <div className="absolute inset-0 [background-image:radial-gradient(circle,rgba(255,255,255,0.10)_1.2px,transparent_1.4px)] [background-size:22px_22px]" />
    </div>
  );
}
