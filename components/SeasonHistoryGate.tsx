"use client";

import { useEffect,useState,useTransition } from "react";
import HallPanelLoading from "./hall/HallPanelLoading";
import SeasonHistoryView from "./SeasonHistoryView";

type Props = {
  onBack: () => void;
  /** Deep-link target — opens straight onto this player's Search profile. */
  initialPlayerId?: string | null;
  /** Deep-link target — opens straight onto this team's Search profile. */
  initialTeamKey?: string | null;
  /** Deep-link target — opens straight onto this coach's Search profile. */
  initialCoachName?: string | null;
};

/**
 * Defers mounting the heavy Hall tree so menu / card deep-links paint a
 * loading shell on the same frame as navigation.
 */
export default function SeasonHistoryGate(props: Props) {
  const { onBack } = props;
  const [mounted, setMounted] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(() => setMounted(true));
  }, []);

  const loading = !mounted || isPending;

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-10 md:py-14">
        <div className="max-w-6xl mx-auto">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 mb-6 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright transition-colors"
          >
            <svg
              viewBox="0 0 16 16"
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                d="M9 3l-5 5 5 5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M4 8h10" strokeLinecap="round" />
            </svg>
            Main Menu
          </button>

          <div className="flex items-end justify-between gap-3 flex-wrap mb-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.5em] text-rift-gold/70 mb-2">
                Hall of Seasons
              </div>
              <h1 className="font-display text-3xl md:text-4xl tracking-[0.12em] text-rift-goldbright">
                Season History
              </h1>
            </div>
          </div>

          <HallPanelLoading label="Loading Season History…" />
        </div>
      </div>
    );
  }

  return <SeasonHistoryView {...props} />;
}
