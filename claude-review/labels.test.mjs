// Run with `node --test` in this directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { REVIEW_LABELS, REVIEW_LABEL_NAMES, parseLabelMode, parseHoldOn, labelFor, blocks, planReviewLabels, holdAction } from "./labels.mjs";

test("the four review labels, with fixed colours", () => {
  assert.deepEqual(REVIEW_LABEL_NAMES, ["review:lgtm", "review:minor", "review:changes", "review:missing"]);
  assert.equal(REVIEW_LABELS["looks good"].color, "0E8A16");
  assert.equal(REVIEW_LABELS["minor issues"].color, "FBCA04");
  assert.equal(REVIEW_LABELS["needs changes"].color, "B60205");
  assert.equal(REVIEW_LABELS.missing.color, "BFBFBF");
  for (const l of Object.values(REVIEW_LABELS)) assert.match(l.color, /^[0-9A-F]{6}$/);
});

test("label_mode: review unless exactly hold", () => {
  assert.equal(parseLabelMode(undefined), "review");
  assert.equal(parseLabelMode(""), "review");
  assert.equal(parseLabelMode("review"), "review");
  assert.equal(parseLabelMode("hold"), "hold");
  assert.equal(parseLabelMode("Hold"), "hold");
  assert.equal(parseLabelMode(" hold"), "review");
  assert.equal(parseLabelMode("typo"), "review");
});

test("hold_on parsing keeps today's default", () => {
  assert.deepEqual(parseHoldOn(undefined), ["needs changes"]);
  assert.deepEqual(parseHoldOn(""), []);
  assert.deepEqual(parseHoldOn("Needs changes, minor issues"), ["needs changes", "minor issues"]);
});

test("labelFor maps verdicts, anything else is missing", () => {
  assert.equal(labelFor("looks good").name, "review:lgtm");
  assert.equal(labelFor("minor issues").name, "review:minor");
  assert.equal(labelFor("needs changes").name, "review:changes");
  assert.equal(labelFor(null).name, "review:missing");
  assert.equal(labelFor("something else").name, "review:missing");
});

test("blocks follows hold_on; a missing review blocks whenever hold_on is set", () => {
  const holdOn = ["needs changes"];
  assert.equal(blocks("needs changes", holdOn), true);
  assert.equal(blocks("minor issues", holdOn), false);
  assert.equal(blocks("looks good", holdOn), false);
  assert.equal(blocks(null, holdOn), true);
  assert.equal(blocks(null, []), false);
});

test("planReviewLabels leaves exactly one review label", () => {
  assert.deepEqual(planReviewLabels([], "looks good"), { label: REVIEW_LABELS["looks good"], add: true, remove: [] });
  const p = planReviewLabels(["bug", "review:changes", "review:missing", "hold"], "looks good");
  assert.equal(p.add, true);
  assert.deepEqual(p.remove, ["review:changes", "review:missing"]);
  const same = planReviewLabels(["review:minor"], "minor issues");
  assert.equal(same.add, false);
  assert.deepEqual(same.remove, []);
  const miss = planReviewLabels(["review:lgtm"], null);
  assert.equal(miss.label.name, "review:missing");
  assert.deepEqual(miss.remove, ["review:lgtm"]);
});

test("holdAction: label_mode hold behaves as before", () => {
  const holdOn = ["needs changes"];
  const base = { mode: "hold", holdOn, held: false, byReview: false };
  assert.equal(holdAction({ ...base, verdict: "needs changes" }), "add");
  assert.equal(holdAction({ ...base, verdict: "needs changes", held: true }), "keep");
  assert.equal(holdAction({ ...base, verdict: "looks good", held: true, byReview: true }), "remove");
  assert.equal(holdAction({ ...base, verdict: "looks good", held: true, byReview: false }), "keep");
  assert.equal(holdAction({ ...base, verdict: "minor issues" }), "keep");
  assert.equal(holdAction({ ...base, holdOn: [], verdict: "needs changes" }), "keep");
});

test("holdAction: label_mode review never adds, only lifts its own old hold", () => {
  const holdOn = ["needs changes"];
  const base = { mode: "review", holdOn, held: false, byReview: false };
  assert.equal(holdAction({ ...base, verdict: "needs changes" }), "keep");
  assert.equal(holdAction({ ...base, verdict: "looks good", held: true, byReview: true }), "remove");
  assert.equal(holdAction({ ...base, verdict: "looks good", held: true, byReview: false }), "keep");
  assert.equal(holdAction({ ...base, verdict: "needs changes", held: true, byReview: true }), "keep");
});
