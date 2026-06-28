"use client";

import { useEffect } from "react";
import { placeholderIconFor } from "@/lib/communityDragon";

// Global, one-mount fallback for broken champion icons. Every champion icon in
// the app is an <img> pointing at CommunityDragon's CDN (see lib/communityDragon
// iconUrlFor). That CDN occasionally 404s (brand-new champ ids, transient
// failures), and there are ~50 render sites with no per-site onError. Rather
// than wrap all of them, we catch image load errors app-wide in the capture
// phase (error events don't bubble, but they DO capture) and swap the failed
// champion icon for the letter-placeholder we already generate for pending
// releases. Scoped to champion-icons URLs so other images keep their own
// handling; the data: guard stops re-processing the placeholder (no loop).
export default function ChampionImageFallback() {
  useEffect(() => {
    function onError(e: Event) {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (img.src.startsWith("data:")) return; // already a placeholder
      if (!img.src.includes("champion-icons")) return; // only champ CDN icons
      img.src = placeholderIconFor(img.alt || "?");
    }
    document.addEventListener("error", onError, true); // capture phase
    return () => document.removeEventListener("error", onError, true);
  }, []);
  return null;
}
