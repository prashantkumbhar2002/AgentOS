import { cn } from "@/lib/utils"

/**
 * AgentOS brand mark + wordmark.
 *
 * Visual concept: a hexagonal **control-plane kernel** at the center, ringed by
 * six **agent nodes** connected via signal lines. One agent is highlighted in
 * emerald to convey real-time observation — the platform's core value (a
 * single operator watching a network of agents in flight). The geometry is a
 * regular hexagon (radial symmetry → no "front" or "top", reinforcing the
 * "you are at the center" reading).
 *
 * Color strategy: every fill/stroke resolves through Tailwind theme classes
 * (`text-violet-600 dark:text-violet-400`, `text-foreground`, etc.) — the
 * mark adapts to both modes without `prefers-color-scheme` hacks. Only the
 * standalone `favicon.svg` (which can't read app theme state) uses a media
 * query for light/dark switching.
 */

// Hexagon vertex coordinates pre-computed against a 64×64 viewBox so we don't
// recompute trig at render. `r=26` for the outer agent ring, `r=10` for the
// kernel — proportions tuned to keep all elements legible down to 24px.
const OUTER_VERTICES = [
    { x: 32, y: 6 }, // top — highlighted "live" node
    { x: 54.5, y: 19 }, // top-right
    { x: 54.5, y: 45 }, // bottom-right
    { x: 32, y: 58 }, // bottom
    { x: 9.5, y: 45 }, // bottom-left
    { x: 9.5, y: 19 }, // top-left
] as const

const KERNEL_VERTICES = [
    { x: 32, y: 22 },
    { x: 40.66, y: 27 },
    { x: 40.66, y: 37 },
    { x: 32, y: 42 },
    { x: 23.34, y: 37 },
    { x: 23.34, y: 27 },
] as const

const KERNEL_POLYGON_POINTS = KERNEL_VERTICES.map((v) => `${v.x},${v.y}`).join(" ")

export interface LogoMarkProps {
    /** Tailwind sizing classes; defaults to `h-8 w-8`. */
    className?: string
    /** Hide from screen readers when paired with a separate text label. */
    decorative?: boolean
    /**
     * If `false`, all six agent nodes use the muted brand color. Defaults to
     * `true` — one node is highlighted in emerald to suggest a live signal.
     * Set to `false` for purely decorative placements (e.g. empty states)
     * where the "live" cue would be misleading.
     */
    showLiveSignal?: boolean
}

/**
 * The icon-only mark. Use everywhere a square symbol is needed: sidebar,
 * favicon-style placements, empty-state hero spots.
 */
export function LogoMark({
    className,
    decorative = false,
    showLiveSignal = true,
}: LogoMarkProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 64 64"
            role={decorative ? "presentation" : "img"}
            aria-label={decorative ? undefined : "AgentOS"}
            aria-hidden={decorative || undefined}
            className={cn("h-8 w-8", className)}
        >
            {/* Connector lines: kernel vertex → outer agent node. Drawn first
                so the kernel and dots render on top. */}
            <g
                className="text-violet-500/55 dark:text-violet-400/55"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
            >
                {OUTER_VERTICES.map((outer, i) => {
                    const inner = KERNEL_VERTICES[i]!
                    return (
                        <line
                            key={i}
                            x1={inner.x}
                            y1={inner.y}
                            x2={outer.x}
                            y2={outer.y}
                        />
                    )
                })}
            </g>

            {/* Agent nodes (idle): violet, slightly muted so the highlighted
                node stands out clearly. */}
            <g className="text-violet-500 dark:text-violet-400" fill="currentColor">
                {OUTER_VERTICES.slice(showLiveSignal ? 1 : 0).map((v, i) => (
                    <circle key={i} cx={v.x} cy={v.y} r={3.4} />
                ))}
            </g>

            {/* Live-signal node: emerald, very slightly larger so the "this
                one is talking right now" reading lands at small sizes. */}
            {showLiveSignal && (
                <circle
                    cx={OUTER_VERTICES[0]!.x}
                    cy={OUTER_VERTICES[0]!.y}
                    r={3.8}
                    className="text-emerald-500 dark:text-emerald-400"
                    fill="currentColor"
                />
            )}

            {/* Kernel: filled hex in primary brand violet — the visual anchor.
                Stroke-linejoin round softens the corners at small sizes. */}
            <polygon
                points={KERNEL_POLYGON_POINTS}
                className="text-violet-600 dark:text-violet-400"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinejoin="round"
            />

            {/* Inner kernel dot. Uses theme `background` so it inverts on
                dark/light: white-ish dot on light kernel (light mode) and
                dark-ish dot on lighter kernel (dark mode). The contrast stays
                readable in both modes without per-mode overrides. */}
            <circle
                cx={32}
                cy={32}
                r={2.4}
                className="text-background"
                fill="currentColor"
            />
        </svg>
    )
}

export interface LogoProps {
    /** Wrapper class for the whole logo block. */
    className?: string
    /** Override mark size; defaults to `h-10 w-10`. */
    markClassName?: string
    /** Hide the tagline (useful in tight headers). */
    showTagline?: boolean
}

/**
 * Full lockup: mark + wordmark + tagline. Use on auth pages, marketing
 * surfaces, empty-state heroes, and anywhere a confident product identity is
 * appropriate. For tight UI chrome (sidebar, breadcrumbs) prefer `LogoMark`.
 */
export function Logo({
    className,
    markClassName,
    showTagline = true,
}: LogoProps) {
    return (
        <div className={cn("flex items-center gap-3", className)}>
            <LogoMark className={cn("h-10 w-10 shrink-0", markClassName)} />
            <div className="flex flex-col leading-none">
                <span className="text-2xl font-bold tracking-tight text-foreground">
                    Agent
                    <span className="text-emerald-600 dark:text-emerald-400">OS</span>
                </span>
                {showTagline && (
                    <span className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Control plane for AI agents
                    </span>
                )}
            </div>
        </div>
    )
}
