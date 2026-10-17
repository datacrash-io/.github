// Label selection for review.mjs, kept free of I/O so labels.test.mjs can cover it
// (`node --test` in this directory).
//
// label_mode "review" (the default): after each review of the current head the PR carries
// exactly one of the review:* labels below, named after the verdict, or review:missing when
// no review could run. The shared automerge workflow refuses the labels in its
// blocking_labels input. label_mode "hold": the older behaviour, one generic hold label for
// a verdict in hold_on.

export const REVIEW_LABELS = {
  "looks good": { name: "review:lgtm", color: "0E8A16", description: "Claude review: looks good" },
  "minor issues": { name: "review:minor", color: "FBCA04", description: "Claude review: minor issues" },
  "needs changes": { name: "review:changes", color: "B60205", description: "Claude review: changes needed" },
  missing: { name: "review:missing", color: "BFBFBF", description: "Claude review could not run on this head" },
};
export const REVIEW_LABEL_NAMES = Object.values(REVIEW_LABELS).map((l) => l.name);

// Anything but "hold" means the default, "review". Case-insensitive and untrimmed, the way
// the workflow's step conditions compare it.
export const parseLabelMode = (value) => (String(value ?? "").toLowerCase() === "hold" ? "hold" : "review");

export const parseHoldOn = (value) => String(value ?? "needs changes").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);

// The review:* label for a verdict; null (no review) or an unknown verdict is "missing".
export const labelFor = (verdict) => REVIEW_LABELS[verdict] ?? REVIEW_LABELS.missing;

// Whether the review says this outcome blocks automerge: a verdict listed in hold_on, and
// a missing review whenever hold_on is set (an unreviewed head never counts as passing).
export const blocks = (verdict, holdOn) => (verdict ? holdOn.includes(verdict) : holdOn.length > 0);

// What to do with the review:* labels: add the verdict's label unless it is already there,
// and remove every other review:* label the PR carries.
export function planReviewLabels(current, verdict) {
  const want = labelFor(verdict);
  return {
    label: want,
    add: !current.includes(want.name),
    remove: REVIEW_LABEL_NAMES.filter((n) => n !== want.name && current.includes(n)),
  };
}

// What to do with the hold label after a completed review: "add", "remove" or "keep".
// Only label_mode "hold" adds it. Both modes remove a hold the review itself placed once a
// verdict outside hold_on comes in; a hold a person added is never touched.
export function holdAction({ mode, verdict, holdOn, held, byReview }) {
  const blocking = holdOn.includes(verdict);
  if (mode === "hold" && blocking && !held) return "add";
  if (!blocking && held && byReview) return "remove";
  return "keep";
}
