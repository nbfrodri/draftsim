import { afterEach } from "vitest";
import { resetNeuralDraftPolicy } from "./lib/draftAI/neural";

// Unit tests must use heuristic AI unless they explicitly inject a mock policy.
process.env.NEURAL_DRAFT_DISABLED = "1";

afterEach(() => {
  resetNeuralDraftPolicy();
});
