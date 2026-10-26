"use client";

import ErrorFallback, { type ErrorFallbackProps } from "@/components/ErrorFallback";
import { brand, body } from "./fonts";
import "./globals.css";

// This boundary replaces the root layout, including its document, styles and fonts.
export default function GlobalError(props: ErrorFallbackProps) {
	return (
		<html lang="en" className={`${brand.variable} ${body.variable}`}>
			<body className="font-body antialiased">
				<title>DraftSim — Unexpected error</title>
				<ErrorFallback {...props} />
			</body>
		</html>
	);
}
