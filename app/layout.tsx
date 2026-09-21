import ChampionImageFallback from "@/components/ChampionImageFallback";
import PersistenceNotice from "@/components/PersistenceNotice";
import type { Metadata } from "next";
import { Cinzel,Inter } from "next/font/google";
import "./globals.css";

const brand = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-brand",
});

const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

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
