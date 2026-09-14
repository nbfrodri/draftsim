import { fetchChampions } from "@/lib/communityDragon";
import DraftApp from "@/components/DraftApp";

// The packaged champion catalogue makes static builds independent of remote APIs.
// DraftApp can refresh the catalogue after startup when a connection is available.
export default async function HomePage() {
  const champions = await fetchChampions();
  return <DraftApp champions={champions} />;
}
