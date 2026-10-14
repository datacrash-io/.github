# datacrash-io/.github

Shared GitHub Actions workflows for datacrash-io repositories.

## Workflows

- `.github/workflows/reusable-automerge-ready-prs.yml`: merges a pull request once it is
  ready for review and every other check on its head commit has passed. Inputs and optional
  secrets are documented in the file.

```yaml
jobs:
  automerge:
    uses: datacrash-io/.github/.github/workflows/reusable-automerge-ready-prs.yml@main
    with:
      merge_strategy: merge
```

- `.github/workflows/reusable-gitleaks.yml`: secret scanning with
  [gitleaks](https://github.com/gitleaks/gitleaks) (pinned release, checksum-verified). On a
  pull request it scans only the PR's commits and fails the check on a leak, which blocks
  automerge; on push it scans only the pushed commits; on schedule/dispatch the full history. Findings are redacted. Tune with a
  root `.gitleaks.toml`; silence a reviewed false positive via `.gitleaksignore`. Exists
  because GitHub's own secret scanning needs Advanced Security on private repos.
- `.github/workflows/reusable-claude-review.yml`: advisory PR review run by
  `claude-review/review.mjs` on the Claude Agent SDK: one review with inline comments. Not
  `anthropics/claude-code-action`, because that runs Claude Code, which API credits granted with
  a Claude plan don't cover. The agent reads the repo but has no shell and no GitHub token; the
  script posts its findings. Inputs: `model`, `max_turns`, `max_budget_usd` (default 1),
  `extra_instructions`, `hold_on`, `hold_label`.
  **Hold:** when the verdict is in `hold_on` (default `needs changes`; add `minor issues` for a
  stricter repo), the review adds the `hold` label, which the automerge workflow refuses to
  merge. Callers also trigger on `synchronize`: a push re-runs the review only on a PR the review
  itself put on hold, and the review lifts that hold once the verdict allows. A `hold` a person
  added is never removed. To override, remove the label and re-run the automerge job. Never fails
  the check (missing key, API error, timeout), so it never blocks automerge. Authenticates
  with Workload Identity Federation when the caller passes the `anthropic_*` identifiers and
  grants `id-token: write` (no stored key), otherwise with the `ANTHROPIC_API_KEY` secret;
  skipped with a notice when it has neither. Skips drafts and bot PRs.

Caller for both (`.github/workflows/security-review.yml`). Trigger the review only on
`opened`/`reopened`/`ready_for_review`, not `synchronize`, so a PR is reviewed once rather
than on every push. Use `claude-sonnet-5-5` where funds, keys or infrastructure are at stake,
the default `claude-haiku-5-5` elsewhere.

```yaml
name: Security & Review
on:
  pull_request:
    types: [opened, reopened, ready_for_review, synchronize]
  push:
    branches: [main]
permissions:
  contents: read
  pull-requests: write
  id-token: write  # federation only
jobs:
  gitleaks:
    uses: datacrash-io/.github/.github/workflows/reusable-gitleaks.yml@main
  claude-review:
    # Every PR event: the shared workflow reviews once per PR, and on a push only
    # re-reviews a PR its own review put on hold.
    if: github.event_name == 'pull_request'
    uses: datacrash-io/.github/.github/workflows/reusable-claude-review.yml@main
    secrets: inherit
    with:
      model: claude-haiku-5-5
      # Identifiers, not secrets. Keep them in the private caller, not in this repo.
      anthropic_federation_rule_id: fdrl_...
      anthropic_organization_id: <organization uuid>
      anthropic_service_account_id: svac_...
```
