"use client";

import { useEffect, useState } from "react";

export interface ErrorFallbackProps {
	error: Error & { digest?: string };
	retry: () => void;
}

export default function ErrorFallback({ error, retry }: ErrorFallbackProps) {
	const [copyStatus, setCopyStatus] = useState("");
	useEffect(() => { console.error("[draftsim] Rendering error:", error); }, [error]);
	const details = [error.stack || `${error.name}: ${error.message}`, error.digest && `Error ID: ${error.digest}`].filter(Boolean).join("\n");
	const copyDetails = async () => {
		try {
			await navigator.clipboard.writeText(details);
			setCopyStatus("Details copied.");
		} catch {
			setCopyStatus("Could not copy. Select the details below to copy them manually.");
		}
	};
	return (
		<main className="min-h-[100svh] flex items-center justify-center px-4 py-10 font-body">
			<div className="w-full max-w-lg bg-rift-panel border border-rift-gold/40 p-8 text-center">
				<div className="font-brand text-4xl tracking-[0.12em] text-rift-goldbright mb-6">DRAFTSIM</div>
				<h1 className="font-display text-xl text-rift-goldbright mb-3">Something went wrong</h1>
				<p className="text-sm text-rift-mutedbright mb-4">DraftSim encountered an unexpected error. You can try again or copy the details to help investigate.</p>
				<p role="alert" className="text-sm text-rift-mutedbright break-words mb-4">{error.message || "No error message was provided."}</p>
				{error.digest && <p className="text-xs text-rift-mutedbright mb-4">Error ID: {error.digest}</p>}
				<div className="flex flex-wrap justify-center gap-3">
					<button type="button" onClick={retry} className="btn-gold px-5 py-3 font-display">Try again</button>
					<button type="button" onClick={copyDetails} className="border border-rift-gold/40 text-rift-goldbright hover:bg-rift-gold/10 px-5 py-3 font-display">Copy details</button>
				</div>
				<p role="status" className="text-xs text-rift-mutedbright mt-3">{copyStatus}</p>
				<details className="mt-4 text-left text-xs text-rift-mutedbright">
					<summary className="cursor-pointer">Error details</summary>
					<pre className="font-body whitespace-pre-wrap break-words mt-2 select-text">{details}</pre>
				</details>
			</div>
		</main>
	);
}
