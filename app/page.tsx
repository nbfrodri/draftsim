import { fetchChampions } from "@/lib/communityDragon";
import DraftApp from "@/components/DraftApp";

// Champions are fetched once at build time (static export — there is no
// server at runtime). Rebuild the app to refresh the champion list.
export default async function HomePage() {
  const champions = await fetchChampions();
  return <DraftApp champions={champions} />;
}
