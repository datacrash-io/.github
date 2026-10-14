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
- `.github/workflows/reusable-claude-review.yml`: advisory PR review by Claude Code
  (`anthropics/claude-code-action`), inline comments plus one summary comment. Never fails
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
    if: github.event_name == 'pull_request' && github.event.action != 'synchronize'
    uses: datacrash-io/.github/.github/workflows/reusable-claude-review.yml@main
    secrets: inherit
    with:
      model: claude-haiku-5-5
      # Identifiers, not secrets. Keep them in the private caller, not in this repo.
      anthropic_federation_rule_id: fdrl_...
      anthropic_organization_id: <organization uuid>
      anthropic_service_account_id: svac_...
```
