import { fetchChampions } from "@/lib/communityDragon";
import DraftApp from "@/components/DraftApp";

export const revalidate = 86400;

export default async function HomePage() {
  const champions = await fetchChampions();
  return <DraftApp champions={champions} />;
}
