import type { CSSProperties } from "react";

/**
 * The boot screen — test tube, conical flask, volumetric flask and a DNA
 * helix, all on screen at once, their bases pinned to a single point and
 * fanned out 45 degrees apart, straddling vertical. Each slides out along its
 * own axis and back on a staggered clock, so the group breathes as a wave
 * rather than four things twitching in unison.
 *
 * There are two of these on purpose. The inline copy in index.html paints on
 * the browser's first frame, long before this bundle has downloaded; this one
 * takes over for the gaps React knows about (chiefly the re-auth after a
 * logout, when the user query resets). They are drawn to match, so whichever
 * is on screen the user only ever sees one continuous animation.
 *
 * If you restyle one, restyle the other. The shared motion vocabulary lives in
 * index.css under "splash"; the two use different SVG element ids (splash-*
 * here, bs-* there) because both can be in the DOM at the same moment.
 */

/**
 * Where each vessel points, measured from straight up, clockwise. The bases
 * all sit on one origin, so these are the directions the fan opens in.
 *
 * 45 degrees apart, but straddling vertical rather than running 45..180 — that
 * earlier range put the whole spread between "up-right" and "straight down",
 * so the group read as having toppled over to the right. Centred on 0 it
 * stands up, and no vessel is tilted past 67.5 degrees, which also keeps the
 * liquid inside them looking poured rather than spilled.
 *
 * The delay is an eighth of the period, negative so each vessel enters the
 * cycle a step ahead of the last. That phase offset is the whole trick: on a
 * shared delay the four pump in and out in lockstep, which reads as a glitch;
 * offset, it reads as a wave running across the fan.
 */
const RAYS = [
  { angle: -67.5, delay: 0 },
  { angle: -22.5, delay: -0.45 },
  { angle: 22.5, delay: -0.9 },
  { angle: 67.5, delay: -1.35 },
];

export function LabSplash({ label = "Yuklanmoqda" }: { label?: string }) {
  const vessels = [<TestTube />, <ConicalFlask />, <VolumetricFlask />, <DnaHelix />];

  return (
    <div className="aurora flex min-h-screen flex-col items-center justify-center gap-8">
      <div className="splash-fan">
        {/* Glow behind the whole fan, so the group reads as lit. */}
        <div className="splash-halo pointer-events-none absolute -inset-6 rounded-[50%]" />
        {/* The origin made visible — the point the four spring from. */}
        <div className="splash-core pointer-events-none" />

        {vessels.map((vessel, i) => (
          <div
            key={i}
            className="splash-ray"
            style={
              {
                "--splash-angle": `${RAYS[i].angle}deg`,
                animationDelay: `${RAYS[i].delay}s`,
              } as CSSProperties
            }
          >
            <svg
              viewBox="0 0 64 96"
              className="h-full w-full drop-shadow-[0_4px_12px_hsl(var(--brand-from)/0.4)]"
              role="img"
              aria-label={i === 0 ? label : undefined}
              aria-hidden={i === 0 ? undefined : true}
            >
              {vessel}
            </svg>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3">
        <p className="text-lg font-bold tracking-tight text-gradient">MedLab</p>
        <p className="text-sm text-muted-foreground">{label}...</p>
        <div className="splash-bar relative h-[3px] w-40 overflow-hidden rounded-full bg-primary/15" />
      </div>
    </div>
  );
}

// --------------------------------------------------------------- primitives

const GLASS = {
  fill: "hsl(var(--primary) / 0.05)",
  stroke: "hsl(var(--primary) / 0.5)",
  strokeWidth: 1.6,
} as const;

/**
 * Shared by all three vessels: the rect that gets slid up and down behind a
 * clip of the vessel's interior. Sliding a full-height rect is what makes it
 * look poured rather than scaled.
 *
 * Every vessel's rect starts at y=24 so one keyframe fits all of them — see
 * splash-fill in index.css, which puts the surface between y=54 and y=32.
 */
function Sample({ id, x, width }: { id: string; x: number; width: number }) {
  return (
    <>
      <rect className="splash-liquid" x={x} y={24} width={width} height={70} fill={`url(#${id})`} />
      {/* Kept below y=54 so a bubble is never left hanging above the surface
          at the shallow end of the fill cycle. */}
      <g className="splash-bubble" style={{ animationDelay: "0s" }}>
        <circle cx="30" cy="72" r="2" fill="hsl(0 0% 100% / 0.75)" />
      </g>
      <g className="splash-bubble" style={{ animationDelay: "0.8s" }}>
        <circle cx="35" cy="74" r="1.4" fill="hsl(0 0% 100% / 0.65)" />
      </g>
      <g className="splash-bubble" style={{ animationDelay: "1.5s" }}>
        <circle cx="32" cy="70" r="1.1" fill="hsl(0 0% 100% / 0.55)" />
      </g>
    </>
  );
}

function SampleGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="hsl(var(--brand-to))" />
      <stop offset="100%" stopColor="hsl(var(--brand-from))" />
    </linearGradient>
  );
}

/** The single line that sells any of these as glass. */
function Glint({ x, y, height }: { x: number; y: number; height: number }) {
  return <rect x={x} y={y} width={2.2} height={height} rx={1.1} fill="hsl(0 0% 100% / 0.55)" />;
}

/** The ground-glass lip every vessel is topped with. */
function Lip({ x, width }: { x: number; width: number }) {
  return (
    <rect
      x={x}
      y={8}
      width={width}
      height={width > 16 ? 6 : 5}
      rx={2.5}
      fill="hsl(var(--primary) / 0.16)"
      stroke="hsl(var(--primary) / 0.55)"
      strokeWidth="1.4"
    />
  );
}

// ------------------------------------------------------------------ vessels

/** Probirka — straight walls, hemispherical base. */
function TestTube() {
  return (
    <>
      <defs>
        <SampleGradient id="splash-g1" />
        <clipPath id="splash-c1">
          <path d="M26 17 L26 74 A6 6 0 0 0 38 74 L38 17 Z" />
        </clipPath>
      </defs>
      <path d="M24 13 L24 74 A8 8 0 0 0 40 74 L40 13 Z" {...GLASS} />
      <g clipPath="url(#splash-c1)">
        <Sample id="splash-g1" x={26} width={12} />
      </g>
      <Glint x={27.4} y={20} height={40} />
      <Lip x={22} width={20} />
    </>
  );
}

/** Konussimon kolba — Erlenmeyer. The sample widens as it rises. */
function ConicalFlask() {
  return (
    <>
      <defs>
        <SampleGradient id="splash-g2" />
        <clipPath id="splash-c2">
          <path d="M30 14 L30 37 L17 77 Q16 80 18.5 80 L45.5 80 Q48 80 47 77 L34 37 L34 14 Z" />
        </clipPath>
      </defs>
      <path d="M28 12 L28 36 L14 77 Q12.5 82 17 82 L47 82 Q51.5 82 50 77 L36 36 L36 12 Z" {...GLASS} />
      <g clipPath="url(#splash-c2)">
        <Sample id="splash-g2" x={14} width={36} />
      </g>
      <Glint x={29.2} y={17} height={17} />
      <Lip x={25} width={14} />
    </>
  );
}

/** O'lchov kolbasi — long graduated neck over a round bulb. */
function VolumetricFlask() {
  return (
    <>
      <defs>
        <SampleGradient id="splash-g3" />
        <clipPath id="splash-c3">
          <path d="M31 14 L31 47 A17 17 0 1 0 33 47 L33 14 Z" />
        </clipPath>
      </defs>
      <path d="M29 12 L29 46 A19 19 0 1 0 35 46 L35 12 Z" {...GLASS} />
      <g clipPath="url(#splash-c3)">
        <Sample id="splash-g3" x={13} width={38} />
      </g>
      {/* The calibration ring — the one mark that makes it *volumetric*. */}
      <rect x="27.5" y="37.4" width="9" height="1.4" rx="0.7" fill="hsl(var(--primary) / 0.65)" />
      <Glint x={30.1} y={17} height={17} />
      <path
        d="M20 62 A13 13 0 0 1 25 51"
        fill="none"
        stroke="hsl(0 0% 100% / 0.4)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <Lip x={26} width={12} />
    </>
  );
}

/**
 * DNA — two strands crossing at y=10, 48 and 86, with base-pair rungs. The
 * group flips on its X axis forever, which passes through edge-on and so
 * reads as the helix turning rather than as a mirror.
 */
function DnaHelix() {
  // Rung half-widths taper toward each crossing, which is what gives the
  // flat drawing its twist. x extents traced off the curves themselves.
  const rungs: [number, number, number][] = [
    [15, 27, 37],
    [20, 23, 41],
    [29, 20, 44],
    [38, 23, 41],
    [43, 27, 37],
    [53, 27, 37],
    [58, 23, 41],
    [67, 20, 44],
    [76, 23, 41],
    [81, 27, 37],
  ];

  return (
    <g className="splash-dna">
      {rungs.map(([y, x1, x2], i) => (
        <line
          key={y}
          x1={x1}
          y1={y}
          x2={x2}
          y2={y}
          stroke={i % 2 ? "hsl(var(--brand-to) / 0.75)" : "hsl(var(--brand-from) / 0.7)"}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      ))}
      <path
        d="M32 10 C48 23 48 35 32 48 C16 61 16 73 32 86"
        fill="none"
        stroke="hsl(var(--brand-from))"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M32 10 C16 23 16 35 32 48 C48 61 48 73 32 86"
        fill="none"
        stroke="hsl(var(--brand-to))"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </g>
  );
}
