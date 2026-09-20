"use client";

import { useEffect, useState } from "react";
import { useDraftStore } from "@/store/draftStore";
import {
  BULK_YEARS_CONFIRM_THRESHOLD,
  BULK_YEARS_MAX,
  clampBulkYearCount,
} from "@/lib/season/bulkYears";
import {
  pickRealityExportTarget,
  supportsSilentRealityExportOverwrite,
  type RealityExportTarget,
} from "@/lib/realityExport";
import { formatElapsedDuration } from "@/lib/sim/simEta";
import { isDesktop } from "@/lib/desktopStorage";
import Modal from "../Modal";
import SimRemainingEta from "../sim/SimRemainingEta";

const BULK_PRESETS = [5, 10, 25] as const;
const SIM_RESULTS_ANCHOR_ID = "sim-results-panel";

function bulkInputError(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Enter number of seasons";
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return "Enter a valid number";
  if (!Number.isInteger(n)) return "Whole seasons only";
  if (n < 1) return "Minimum 1 season";
  if (n > BULK_YEARS_MAX) return `Maximum ${BULK_YEARS_MAX} seasons`;
  return null;
}

function scrollToSimResults() {
  document
    .getElementById(SIM_RESULTS_ANCHOR_ID)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Bulk franchise advance — sim N full years with AI transfer/offseason resolution. */
export default function BulkYearsControl() {
  const season = useDraftStore((s) => s.season);
  const simulating = useDraftStore((s) => s.simulating);
  const simResultsFeed = useDraftStore((s) => s.simResultsFeed);
  const simulateRealityYears = useDraftStore((s) => s.simulateRealityYears);
  const cancelBulkYears = useDraftStore((s) => s.cancelBulkYears);

  const [expanded, setExpanded] = useState(false);
  const [yearsInput, setYearsInput] = useState("5");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveAfterEachYear, setSaveAfterEachYear] = useState(false);
  const [exportAfterEachYear, setExportAfterEachYear] = useState(false);
  const [exportPickBusy, setExportPickBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const jobs = useDraftStore(s => s.bulkYearJobs);
  const resume = useDraftStore(s => s.resumeBulkYears);
  const bulkYearsProgress = useDraftStore((s) => s.bulkYearsProgress);

  useEffect(() => {
    if (!bulkYearsProgress?.startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [bulkYearsProgress?.startedAt]);

  if (!season?.franchise) return null;

  const fr = season.franchise;
  const controlsOpen = expanded || !!bulkYearsProgress || !!jobs[fr.id];
  const busy = !!simulating || !!bulkYearsProgress || exportPickBusy;
  const parsed = clampBulkYearCount(Number(yearsInput));
  const inputError = bulkInputError(yearsInput);
  const canSubmit = !busy && !inputError;
  const progressPct = bulkYearsProgress
    ? Math.min(100, Math.round((bulkYearsProgress.completed / bulkYearsProgress.total) * 100))
    : 0;
  const showResultsLink = !busy && simResultsFeed.length > 0;

  const elapsedLabel =
    bulkYearsProgress?.startedAt != null
      ? formatElapsedDuration(now - bulkYearsProgress.startedAt)
      : null;

  const startBulk = async () => {
    setConfirmOpen(false);

    let exportTarget: RealityExportTarget | undefined;

    if (exportAfterEachYear) {
      setExportPickBusy(true);
      try {
        const picked = await pickRealityExportTarget(fr.name);
        if (!picked.ok) {
          if (!picked.cancelled) {
            console.warn("[bulk export] could not pick save location:", picked.error);
          }
          return;
        }
        exportTarget = picked.target;
      } finally {
        setExportPickBusy(false);
      }
    }

    simulateRealityYears(parsed, {
      ...(saveAfterEachYear ? { saveAfterEachYear: true } : {}),
      ...(exportTarget ? { exportTarget } : {}),
    });
  };

  const onSubmit = () => {
    if (!canSubmit) return;
    if (parsed >= BULK_YEARS_CONFIRM_THRESHOLD) {
      setConfirmOpen(true);
      return;
    }
    startBulk();
  };

  const applyPreset = (n: number) => {
    if (busy) return;
    setYearsInput(String(n));
  };

  const onYearsBlur = () => {
    if (!inputError) setYearsInput(String(parsed));
  };

  return (
    <>
      <section
        className="mb-8 border-2 border-rift-gold/40 bg-rift-gold/[0.04]"
        aria-busy={busy}
        aria-labelledby="bulk-sim-heading"
      >
        <div className="px-3 py-2 border-b border-rift-gold/30 flex items-center gap-2 flex-wrap">
          <h2
            id="bulk-sim-heading"
            className="font-display text-base tracking-wider text-rift-goldbright"
          >
            <button type="button" aria-expanded={controlsOpen} aria-controls="bulk-sim-controls" onClick={() => setExpanded(v => !v)}>
              Bulk Simulation {controlsOpen ? "-" : "+"}
            </button>
          </h2>
          <span className="text-[9px] uppercase tracking-[0.3em] text-rift-muted/60">
            {fr.name} · Year {fr.year}
          </span>
          {showResultsLink && (
            <button
              type="button"
              onClick={scrollToSimResults}
              className="ml-auto px-2 py-0.5 border border-rift-gold/50 text-rift-goldbright text-[8px] uppercase tracking-[0.2em] hover:bg-rift-gold/10 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-rift-gold/60"
            >
              View Results ↓
            </button>
          )}
        </div>

        <div id="bulk-sim-controls" hidden={!controlsOpen}>
        {!busy && jobs[fr.id] && <div className="p-3 text-sm text-rift-goldbright" role="status">
          <p>Paused job: Continue through year {jobs[fr.id].targetYear - 1}. Completed seasons are preserved.</p>
          {jobs[fr.id].error && <p className="text-red-300">{jobs[fr.id].error}</p>}
          <button type="button" className="btn-gold mt-2 px-3 py-2" onClick={resume}>Resume simulation</button>
        </div>}
        {bulkYearsProgress ? (
          <div className="px-3 py-3 space-y-3">
            <p className="text-[10px] text-rift-mutedbright/80 leading-relaxed">
              Simulating{" "}
              <span className="text-rift-goldbright tabular-nums">
                {bulkYearsProgress.total}
              </span>{" "}
              full season{bulkYearsProgress.total === 1 ? "" : "s"} for{" "}
              <span className="text-rift-goldbright">{fr.name}</span> — splits,
              internationals, AI transfer windows, and offseason rolls.
            </p>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5 text-[9px] uppercase tracking-[0.2em]">
                <span className="text-rift-gold/75 tabular-nums">
                  Year {bulkYearsProgress.year}
                </span>
                <span className="text-rift-goldbright tabular-nums">
                  {bulkYearsProgress.completed}/{bulkYearsProgress.total} complete
                </span>
              </div>
              <div
                className="h-1.5 bg-rift-line/30 overflow-hidden"
                role="progressbar"
                aria-valuenow={bulkYearsProgress.completed}
                aria-valuemin={0}
                aria-valuemax={bulkYearsProgress.total}
                aria-label="Bulk simulation progress"
              >
                <div
                  className="h-full bg-rift-gold/70 transition-[width] duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] uppercase tracking-[0.2em] text-rift-muted/60 tabular-nums">
              {elapsedLabel && <span>{elapsedLabel}</span>}
              <SimRemainingEta
                startedAt={bulkYearsProgress.startedAt}
                completed={bulkYearsProgress.completed}
                total={bulkYearsProgress.total}
                className="text-rift-gold/60"
              />
            </div>

            <button
              type="button"
              onClick={() => cancelBulkYears()}
              className="w-full sm:w-auto px-4 py-2 border-2 border-rift-red/60 bg-rift-red/10 text-rift-redbright text-[9px] uppercase tracking-[0.25em] hover:bg-rift-red/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-rift-red/50"
            >
              Cancel Simulation
            </button>
          </div>
        ) : (
          <div className="px-3 py-3">
            <p className="text-[10px] text-rift-mutedbright/75 leading-relaxed mb-3">
              Fast-forward multiple franchise years in one run. Each year plays out
              all regional splits and internationals, then AI resolves your
              team&apos;s transfer window and offseason shop before rolling to the
              next year. Results archive to franchise history.
            </p>

            <fieldset disabled={busy} className="space-y-3 disabled:opacity-50">
              <legend className="sr-only">Seasons to simulate</legend>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[8px] uppercase tracking-[0.25em] text-rift-muted/55 mr-1">
                  Presets
                </span>
                {BULK_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => applyPreset(n)}
                    aria-pressed={parsed === n && !inputError}
                    className={`px-2 py-0.5 border text-[8px] uppercase tracking-[0.2em] transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-rift-gold/60 ${
                      parsed === n && !inputError
                        ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                        : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/40"
                    }`}
                  >
                    {n} yrs
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="bulk-years-slider" className="sr-only">
                  Seasons slider
                </label>
                <input
                  id="bulk-years-slider"
                  type="range"
                  min={1}
                  max={BULK_YEARS_MAX}
                  step={1}
                  value={parsed}
                  onChange={(e) => setYearsInput(e.target.value)}
                  className="flex-1 min-w-[8rem] accent-rift-gold cursor-pointer"
                  aria-valuetext={`${parsed} seasons`}
                />
                <div className="flex items-center gap-1.5">
                  <label htmlFor="bulk-years-count" className="sr-only">
                    Seasons to simulate
                  </label>
                  <input
                    id="bulk-years-count"
                    type="number"
                    min={1}
                    max={BULK_YEARS_MAX}
                    value={yearsInput}
                    onChange={(e) => setYearsInput(e.target.value)}
                    onBlur={onYearsBlur}
                    inputMode="numeric"
                    aria-invalid={inputError ? true : undefined}
                    aria-describedby={inputError ? "bulk-years-error" : "bulk-years-hint"}
                    className={`w-14 px-2 py-1.5 border bg-rift-bg/80 text-rift-goldbright text-[11px] tabular-nums text-center focus:outline-none focus-visible:ring-1 focus-visible:ring-rift-gold/60 ${
                      inputError ? "border-rift-red/60" : "border-rift-line"
                    }`}
                  />
                  <span
                    id="bulk-years-hint"
                    className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/50 whitespace-nowrap"
                  >
                    / {BULK_YEARS_MAX} max
                  </span>
                </div>
              </div>

              {inputError ? (
                <p
                  id="bulk-years-error"
                  role="alert"
                  className="text-[9px] text-rift-redbright"
                >
                  {inputError}
                </p>
              ) : (
                <p className="text-[8px] text-rift-muted/50">
                  {parsed >= BULK_YEARS_CONFIRM_THRESHOLD
                    ? `${parsed} seasons will ask for confirmation before starting.`
                    : `Will auto-advance ${parsed} season${parsed === 1 ? "" : "s"} including splits, internationals, and offseason.`}
                </p>
              )}

              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saveAfterEachYear}
                  onChange={(e) => setSaveAfterEachYear(e.target.checked)}
                  className="mt-0.5 accent-rift-gold cursor-pointer"
                />
                <span className="text-[9px] text-rift-mutedbright/80 leading-relaxed">
                  Save progress after each year completes
                  {saveAfterEachYear ? (
                    <span className="block text-[8px] text-rift-muted/50 mt-0.5">
                      {isDesktop()
                        ? "Flushes franchise state to disk after every year boundary."
                        : "Flushes franchise state to browser storage after every year boundary."}
                    </span>
                  ) : null}
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={exportAfterEachYear}
                  onChange={(e) => setExportAfterEachYear(e.target.checked)}
                  className="mt-0.5 accent-rift-gold cursor-pointer"
                />
                <span className="text-[9px] text-rift-mutedbright/80 leading-relaxed">
                  Export reality backup to file after each year completes
                  {exportAfterEachYear ? (
                    <span className="block text-[8px] text-rift-muted/50 mt-0.5">
                      {isDesktop()
                        ? "Choose a save location once when you start — the same file is overwritten after each year."
                        : supportsSilentRealityExportOverwrite()
                          ? "Choose a save location once when you start — the same file is overwritten after each year."
                          : "Your browser will re-download the same filename after each year (use Chrome or Edge for silent overwrite)."}
                    </span>
                  ) : null}
                </span>
              </label>

              <button
                type="button"
                disabled={!canSubmit}
                onClick={onSubmit}
                className="w-full sm:w-auto px-4 py-2 border-2 border-rift-gold bg-rift-gold/10 text-rift-goldbright text-[9px] uppercase tracking-[0.25em] hover:bg-rift-gold/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-rift-gold/60"
                title={`Simulate ${parsed} full year(s) with AI handling transfer windows and offseason`}
              >
                {exportPickBusy
                  ? "Choosing export location…"
                  : `Sim ${parsed} Year${parsed === 1 ? "" : "s"}`}
              </button>
            </fieldset>

            {busy && !bulkYearsProgress && (
              <p className="mt-2 text-[9px] uppercase tracking-[0.2em] text-rift-muted/55">
                Another simulation is in progress…
              </p>
            )}
          </div>
        )}
        </div>
      </section>

      <Modal
        open={confirmOpen}
        title={`Simulate ${parsed} years?`}
        message={`This will auto-play ${parsed} full seasons for "${fr.name}" (currently Year ${fr.year}), including all splits, internationals, and offseason rolls. Your followed team's windows are handled by AI. This may take a while.${
          saveAfterEachYear
            ? " Progress will be flushed to app storage after each year."
            : ""
        }${
          exportAfterEachYear
            ? " You'll choose one backup file location before the run starts; it is overwritten after each year."
            : ""
        }`}
        confirmLabel={`Sim ${parsed} Years`}
        cancelLabel="Cancel"
        onConfirm={startBulk}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
