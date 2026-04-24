"use client";

import { useEffect } from "react";
import { useDraftStore } from "@/store/draftStore";
import type { Champion } from "@/lib/types";
import CreateSimulationForm from "./CreateSimulationForm";
import DraftView from "./DraftView";
import BetweenGamesView from "./BetweenGamesView";
import SeriesCompleteView from "./SeriesCompleteView";

interface Props {
  champions: Champion[];
}

export default function DraftApp({ champions }: Props) {
  const series = useDraftStore((s) => s.series);
  const setChampions = useDraftStore((s) => s.setChampions);

  useEffect(() => {
    setChampions(champions);
  }, [champions, setChampions]);

  if (!series) return <CreateSimulationForm />;

  if (series.status === "drafting")
    return <DraftView champions={champions} />;

  if (series.status === "between-games")
    return <BetweenGamesView champions={champions} />;

  return <SeriesCompleteView champions={champions} />;
}
