"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  bracketConnectorEdges,
  bracketConnectorPath,
  type BracketConnectorEdge,
  type ConnectorKind,
} from "@/lib/bracketConnectors";
import type { TournamentMatch } from "@/lib/tournament";

type AnchorRegistry = Map<string, HTMLElement>;

const BracketConnectorContext = createContext<{
  register: (id: string, el: HTMLElement | null) => void;
} | null>(null);

type DrawnPath = {
  key: string;
  d: string;
  kind: ConnectorKind;
  active: boolean;
};

/** Winner-only connector strokes. Active (completed) paths are solid gold;
 *  inactive (pending) paths are dimmer to recede until the match resolves. */
function strokeFor(active: boolean): string {
  return active ? "rgba(240, 200, 100, 0.88)" : "rgba(240, 200, 100, 0.26)";
}

function pathsEqual(a: DrawnPath[], b: DrawnPath[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.key !== y.key || x.d !== y.d || x.active !== y.active || x.kind !== y.kind) {
      return false;
    }
  }
  return true;
}

function BracketConnectorSvg({
  rootRef,
  anchorsRef,
  edges,
  matchById,
  layoutVersion,
  className = "",
}: {
  rootRef: React.RefObject<HTMLDivElement | null>;
  anchorsRef: React.RefObject<AnchorRegistry>;
  edges: BracketConnectorEdge[];
  matchById: Map<string, TournamentMatch>;
  layoutVersion: number;
  className?: string;
}) {
  const [paths, setPaths] = useState<DrawnPath[]>([]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const recompute = () => {
      const container = root.getBoundingClientRect();
      const anchors = anchorsRef.current;
      const next: DrawnPath[] = [];
      for (const edge of edges) {
        const fromEl = anchors.get(edge.fromId);
        const toEl = anchors.get(edge.toId);
        if (!fromEl || !toEl) continue;
        const from = fromEl.getBoundingClientRect();
        const to = toEl.getBoundingClientRect();
        const fromMatch = matchById.get(edge.fromId);
        next.push({
          key: `${edge.fromId}->${edge.toId}:${edge.kind}`,
          d: bracketConnectorPath(from, to, container, edge.toSlot),
          kind: edge.kind,
          active: fromMatch?.winner != null,
        });
      }
      setPaths((prev) => (pathsEqual(prev, next) ? prev : next));
    };

    // Paths are root-relative (getBoundingClientRect delta). When the whole
    // BracketConnectorRoot scrolls together (page vertical scroll OR the
    // unified overflow-x wrapper outside this root), relative geometry is
    // unchanged — a capture-phase window scroll listener only forced
    // layout + setState on every wheel tick. ResizeObserver covers real
    // layout changes (card size, flex reflow, window resize).
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        recompute();
      });
    };

    recompute();
    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    for (const el of anchorsRef.current.values()) ro.observe(el);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [rootRef, anchorsRef, edges, matchById, layoutVersion]);

  if (paths.length === 0) return null;

  return (
    <svg
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-0 overflow-visible${className ? ` ${className}` : ""}`}
      width="100%"
      height="100%"
    >
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke={strokeFor(p.active)}
          strokeWidth={p.active ? 2.25 : 1.5}
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeDasharray={p.active ? undefined : "5 4"}
        />
      ))}
    </svg>
  );
}

/** Wrap a bracket region; draws winner/loser connector lines from match links. */
export function BracketConnectorRoot({
  matches,
  children,
  className = "",
  svgClassName = "",
  style,
}: {
  matches: TournamentMatch[];
  children: ReactNode;
  className?: string;
  /** Extra classes on the connector SVG. */
  svgClassName?: string;
  style?: React.CSSProperties;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorsRef = useRef<AnchorRegistry>(new Map());
  const [layoutVersion, setLayoutVersion] = useState(0);
  const bumpRafRef = useRef(0);
  const edges = useMemo(() => bracketConnectorEdges(matches), [matches]);
  const matchById = useMemo(
    () => new Map(matches.map((m) => [m.id, m])),
    [matches],
  );

  const register = useCallback((id: string, el: HTMLElement | null) => {
    const prev = anchorsRef.current.get(id);
    if (prev === el) return;
    if (el) anchorsRef.current.set(id, el);
    else anchorsRef.current.delete(id);
    // Coalesce many MatchAnchor mounts into one layout pass.
    if (bumpRafRef.current) return;
    bumpRafRef.current = requestAnimationFrame(() => {
      bumpRafRef.current = 0;
      setLayoutVersion((v) => v + 1);
    });
  }, []);

  useLayoutEffect(() => {
    return () => {
      if (bumpRafRef.current) cancelAnimationFrame(bumpRafRef.current);
    };
  }, []);

  const contextValue = useMemo(() => ({ register }), [register]);

  return (
    <BracketConnectorContext.Provider value={contextValue}>
      <div ref={rootRef} className={`relative ${className}`} style={style}>
        {children}
        {edges.length > 0 && (
          <BracketConnectorSvg
            rootRef={rootRef}
            anchorsRef={anchorsRef}
            edges={edges}
            matchById={matchById}
            layoutVersion={layoutVersion}
            className={svgClassName}
          />
        )}
      </div>
    </BracketConnectorContext.Provider>
  );
}

/** Anchor a match card so connector lines can measure its position. */
export function MatchAnchor({
  matchId,
  children,
}: {
  matchId: string;
  children: ReactNode;
}) {
  const ctx = useContext(BracketConnectorContext);
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      ctx?.register(matchId, el);
    },
    [ctx, matchId],
  );
  if (!ctx) return <>{children}</>;
  return (
    <div ref={ref} data-match-id={matchId} className="relative z-[1]">
      {children}
    </div>
  );
}
