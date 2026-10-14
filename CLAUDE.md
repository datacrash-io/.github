# datacrash-io/.github

Shared GitHub Actions for the `datacrash-io` organization. Every workflow here is a reusable
workflow (`on: workflow_call`) that the org's repositories call with
`uses: datacrash-io/.github/.github/workflows/<file>@main`. Nothing in this repo runs on its own.

## What is here

| File | Purpose |
|---|---|
| `.github/workflows/reusable-automerge-ready-prs.yml` | Merges a ready PR once every other check on its head commit has passed; can dispatch post-merge workflows. |
| `.github/workflows/reusable-gitleaks.yml` | Secret scanning with gitleaks. Scans a PR's commits or a push's commits, and fails the check on a leak. Scans the full history on schedule or dispatch. |
| `.github/workflows/reusable-claude-review.yml` | PR review, run by `claude-review/review.mjs` on the Claude Agent SDK. Never fails the check. On a verdict in `hold_on` it adds the `hold` label, which stops automerge, and it lifts its own hold after a passing re-review. |
| `claude-review/` | The reviewer script plus a pinned SDK and lockfile. The workflow checks it out from `main` at run time, so a change here reaches every repo on merge. |
| `README.md` | One entry per workflow plus a caller example. |

## This repository is public

Everything committed here is readable by anyone, including the history. Never add:
- secrets, tokens or keys, even ones you believe are expired
- internal hostnames, IPs, cluster or namespace names, server paths
- personal information about anyone, or account details: plans, budgets, credit or spend amounts, usage numbers
- how individual people configure their own tools or AI assistants

Describe behaviour, not the infrastructure behind it. "Runs on the runner label passed in
`runs_on`" is fine; a server's address is not. The same applies to PR descriptions and
commit messages.

## Writing a workflow

- **Callers pin `@main`, so a merge ships to every repo at once.** Keep changes backwards
  compatible: add an input with a default that preserves the current behaviour, don't change
  what an existing input means. Removing or renaming an input breaks every caller.
- **Document every input** in its `description`: what it does and when a caller needs it.
  Start the file with a comment block that explains what the workflow does on each event and
  any non-obvious design choice.
- **Automerge waits for every other check, and a failed or cancelled check blocks the merge.**
  A check that is only informational must never go red: use `continue-on-error` on the step,
  a step `timeout-minutes` below the job's, and no `cancel-in-progress` concurrency on
  pull-request jobs. A check that should block, like gitleaks, fails on purpose and says
  why in an `::error::` line.
- **Runner:** take the label from a `runs_on` input. Don't hardcode `ubuntu-latest`.
- **Least privilege:** declare `permissions:` explicitly at the top level, and set
  `persist-credentials: false` on checkout unless a later step pushes. Exception: a reusable
  workflow that can use a permission only *some* callers grant (e.g. `id-token: write` for
  federation) declares none and inherits the caller's. Requesting a permission the caller
  didn't grant makes the run fail to start, and that red check blocks automerge.
- **Pin third-party actions to a full commit SHA** with the version as a comment
  (`uses: owner/action@<sha> # v1.2.3`). Downloaded binaries need a pinned version and a
  checksum check.
- **Untrusted input** (PR title, body, branch name, commit messages, comments) only goes into
  `run:` through `env:` and a quoted variable, never inline as `${{ ... }}`. A prompt given
  to a model treats that text as data to review, not as instructions.
- **The reviewer agent is sandboxed on purpose.** It gets only Read/Glob/Grep, confined to the checked-out repo (scoped allow rules plus a
  `canUseTool` path check, so `/proc/*/environ` and the token file are out of reach), no GitHub token,
  and `settingSources: []`, so a PR can't plant `.claude` hooks or settings, and the script, not
  the agent, posts to GitHub, after checking the text contains none of the job's credentials. Keep it that way: PR content is untrusted input to a model.
- **Secrets** reach a reusable workflow only through its `secrets:` block, from callers
  using `secrets: inherit`. If a secret is optional, check that it's set and skip with a
  `::notice::` when it's missing.

## Before you open a PR

- Run `actionlint` on the files you changed.
- Update `README.md` (and the table above) when you add a workflow or change how one is called.
- Commit messages and PR descriptions say why the change is needed, not only what changed.
