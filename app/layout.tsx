import ChampionImageFallback from "@/components/ChampionImageFallback";
import PersistenceNotice from "@/components/PersistenceNotice";
import type { Metadata } from "next";
import { brand, body } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "DraftSim — League of Legends Draft Simulator",
  description:
    "Tournament-style LoL draft simulation with Bo1/Bo3/Bo5 series and fearless draft support.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${brand.variable} ${body.variable}`}>
      <body className="font-body antialiased">
        <ChampionImageFallback />
        <PersistenceNotice />
        {children}
      </body>
    </html>
  );
}
