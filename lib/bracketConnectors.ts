import type { TournamentMatch } from "@/lib/tournament";

export type ConnectorKind = "winner" | "loser";

export type BracketConnectorEdge = {
  fromId: string;
  toId: string;
  kind: ConnectorKind;
  toSlot: "blue" | "red";
};

/** Build drawable edges from bracket match links within a match subset.
 *  Only winner-progression edges are generated; loser-drop wires
 *  (losersFeedsInto) are intentionally excluded to reduce visual noise. */
export function bracketConnectorEdges(
  matches: TournamentMatch[],
): BracketConnectorEdge[] {
  const ids = new Set(matches.map((m) => m.id));
  const edges: BracketConnectorEdge[] = [];
  for (const m of matches) {
    if (m.feedsInto && ids.has(m.feedsInto.matchId)) {
      edges.push({
        fromId: m.id,
        toId: m.feedsInto.matchId,
        kind: "winner",
        toSlot: m.feedsInto.slot,
      });
    }
  }
  return edges;
}

/** Classic horizontal bracket connector: ─┐ └── */
export function bracketConnectorPath(
  from: DOMRect,
  to: DOMRect,
  container: DOMRect,
  toSlot: "blue" | "red",
): string {
  const fx = from.right - container.left;
  const fy = from.top + from.height / 2 - container.top;
  const tx = to.left - container.left;
  const slotY = toSlot === "blue" ? 0.32 : 0.68;
  const ty = to.top + to.height * slotY - container.top;
  const midX = fx + (tx - fx) * 0.5;
  return `M ${fx} ${fy} H ${midX} V ${ty} H ${tx}`;
}
