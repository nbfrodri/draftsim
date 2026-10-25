import { Cinzel, Inter } from "next/font/google";

export const brand = Cinzel({
	subsets: ["latin"],
	weight: ["400", "600", "700"],
	variable: "--font-brand",
});

export const body = Inter({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
	variable: "--font-body",
});
