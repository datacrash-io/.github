# datacrash-io/.github

Shared GitHub Actions workflows for datacrash-io repositories.

## Workflows

- `.github/workflows/reusable-automerge-ready-prs.yml`: merges a pull request once it is
  ready for review, every other check on its head commit has passed, and every other
  `pull_request` workflow run of that commit has completed. The last part catches a run
  queued on a concurrency group, which has no check yet. Inputs and optional secrets are
  documented in the file. The recommended setup is event-driven: with
  `wait_for_pending_checks: false` the job checks once and exits, and a `workflow_run`
  trigger listing every other workflow that runs on pull requests starts it again when one
  of them finishes, so no job holds a runner while checks run. The input still defaults to
  `true` (poll and wait) while callers are moved over. A finished run only starts a merge
  when a trusted sender (the owner account or `trusted_senders`) started it and its head is
  in this repository. Each run answers for one PR head and stops once the PR has moved on.
  A PR that a trusted sender did not ready (one an app opened) also merges once a trusted
  user's account applied `review_label` after its current head was pushed; a later push
  needs the label applied again. `review_label` takes one name or several separated by spaces
  or commas (default `review:approved chaos-reviewed`, the current name and the older one), and
  any one that meets the rules counts.

  When a merge attempt fails, the PR stays ready by default (`draft_on_failure`, default
  `false`): it gets one comment per head commit, and the next push or finished check run
  retries the merge. With `draft_on_failure: true` it is moved back to draft and waits until
  someone marks it ready. A PR carrying `hold_label` or a blocking label is never drafted.

  **Labels that stop a merge:** `hold_label` (default `hold`) and every label in
  `blocking_labels` (comma-separated, default `review:minor,review:changes,review:missing,review:owner`,
  the Claude review's labels for a head that is not clean; the variable `AUTOMERGE_BLOCKING_LABELS`,
  set on the organization or a repository, overrides the input, and `none` means no label blocks). Both are read once every check has
  finished, right before the merge, and a failed read means no merge. `review:lgtm` never
  blocks, and a PR with no review label is not blocked by that alone: `required_check_workflows`
  already waits for the review's check on the current head. A repository that lets minor
  findings merge drops `review:minor` here (and from its review's `hold_on`); `''` turns it off.

  **Dependabot PRs merge on their own** (`merge_dependabot`, default `true`; set `false` to
  merge them by hand). On the `workflow_run` path a run Dependabot started is let through,
  and the PR merges once its checks pass only if Dependabot opened it from a `dependabot/`
  branch of the repository, Dependabot authored every commit on it, and every dependency in
  the `updated-dependencies:` metadata of its head commit is a `semver-patch` or
  `semver-minor` update. A major, an entry with no update type (a Docker digest-only bump,
  an indirect security update), or a person's commit on the branch leaves the PR for a
  person, with the reason in the run log; the run stays green and the PR is not drafted.
  Every other gate (checks, unfinished runs, `hold` and blocking labels, the pinned head, `post_merge_workflows`)
  is the same as for any PR, so the merge deploys as usual. GitHub may refuse a
  `GITHUB_TOKEN` merge of a bump that changes `.github/workflows/`; the run then logs that
  it needs an `AUTOMERGE_TOKEN` secret with the `workflow` scope and leaves the PR ready.

  **Linked issues are closed after the merge.** GitHub ignores closing keywords (`Closes #N`)
  on a merge made with `GITHUB_TOKEN`, so the workflow closes each open issue in the same
  repository that the PR links, with a comment naming the PR. A failure only warns. The
  caller must grant `issues: write`; without it the job cannot start.

```yaml
on:
  pull_request:
    types: [opened, reopened, ready_for_review, synchronize, unlabeled]
  workflow_run:
    # By name: every other workflow that runs on this repository's pull requests.
    workflows: [CI, Security & Review]
    types: [completed]
permissions:
  contents: write
  pull-requests: write
  issues: write
  checks: read
  statuses: read
  actions: write
jobs:
  automerge:
    uses: datacrash-io/.github/.github/workflows/reusable-automerge-ready-prs.yml@main
    with:
      merge_strategy: merge
      wait_for_pending_checks: false
```

  After a merge it dispatches `post_merge_workflows`. A listed workflow with a top-level
  `concurrency` group is dispatched at once and queues behind its own running run; one
  without waits (up to 10 minutes, holding the runner) until its earlier runs finish, so two
  of its runs never overlap. A job-level group does not count, because the other jobs of two
  runs still overlap. Give a deploy or release workflow a top-level group to skip the wait.

- `.github/workflows/reusable-gitleaks.yml`: secret scanning with
  [gitleaks](https://github.com/gitleaks/gitleaks) (pinned release, checksum-verified). On a
  pull request it scans only the PR's commits and fails the check on a leak, which blocks
  automerge; on push it scans only the pushed commits; on schedule/dispatch the full history. Findings are redacted. Tune with a
  root `.gitleaks.toml`; silence a reviewed false positive via `.gitleaksignore`. Exists
  because GitHub's own secret scanning needs Advanced Security on private repos.
- `actions/tested-tree` (a composite action, not a workflow): outputs `tested=true` when a
  successful `pull_request` run of the listed CI workflow(s) already tested exactly the tree of
  the commit being run, so a post-merge test job (a deploy's `test`) can skip its steps. It needs
  that run's head commit to have the same tree, and the commit's first parent to be an ancestor
  of that head, which together mean CI tested exactly this code. Anything it cannot establish
  means `tested=false` and the tests run; the step never fails. Needs `actions: read` and
  `contents: read`. Guard the steps of the test job, not the job: a skipped job also skips every
  job that needs it, even indirectly.

```yaml
on:
  workflow_call:
    inputs:
      skip_if_tested:
        description: "Skip the steps when PR CI already passed on this exact tree (deploys only)."
        type: boolean
        default: false
jobs:
  test:
    steps:
      - id: tested
        if: inputs.skip_if_tested
        uses: datacrash-io/.github/actions/tested-tree@main
        with:
          ci_workflows: ci.yml
      - uses: actions/checkout@<sha> # every later step gets the same guard
        if: steps.tested.outputs.tested != 'true'
```

- `actions/chaos-guard` (a composite action) and `.github/workflows/reusable-chaos-review-release.yml`:
  a review gate for pull requests from an automated agent's branches (head branch `chaos/` by
  default). Same-repository pull requests run CI with the repository's secrets, so put the action
  FIRST in every pull-request job that holds a secret or a write token. For an agent branch it fails
  the job until the pull request carries the review label (its `label` input: one name or several
  separated by spaces or commas, default `review:approved chaos-reviewed`; any one that meets the rules
  counts), read live from the
  API, last applied by `owner`, after the current head commit was pushed: an approval covers one
  commit, and a later push needs the label applied again. A run for an agent branch from any other
  event (push, workflow_dispatch) is denied. Every other run passes without an API call. It fails
  rather than skips, because a skipped check counts as passing. Callers with a `permissions:` block
  grant `pull-requests: read` and `contents: read`. The reusable workflow, called on `pull_request: [labeled]`, removes
  `release_labels` (default `review:owner agent:pr hold chaos-agent`: the owner's label is the single approval), then closes
  and reopens the pull request when the owner applies the label (`label`, default `review:approved`, or any
  name in `labels`, default `review:approved chaos-reviewed`; the run acts on the name that was applied). Called on `issues: [labeled]` as
  well, it moves an owner's label on an issue to the ONE open same-repository agent-branch pull
  request by `agent_author` that closes the issue (and only that issue), applying it to that pull request with the token
  (as the owner). It does this only if that pull request referenced the issue, and its current head
  was pushed, before the label was applied. The pull-request label event then releases it as above.
  With no match, or more than one, it changes nothing and comments on the issue; if the pull request's head moves while
  the label is applied, the label is taken off again. An empty `agent_author` fails the issue path. That way its checks run again past the
  gate. It needs a `token` secret whose events trigger workflows (not `GITHUB_TOKEN`). Whoever
  pushes new commits to a reviewed agent branch removes the label first.
  With `dependabot: true` it also releases a Dependabot pull request of the repository (author
  `dependabot[bot]`, a `dependabot/` branch, every commit Dependabot's own and signed) that the owner
  labels, for repositories that keep those on `hold` until someone has reviewed them. Its head must be
  the one named in the newest `<!-- reviewed-head:<sha> -->` comment by `agent_author` (or the owner) and
  must have been pushed before the label. It then removes `release_labels`, and when a check on that head
  did not pass it closes and reopens the pull request so the checks run again as the owner (re-running
  the failed runs would keep Dependabot's privileges). A reopen that keeps failing is retried and then
  reported on the pull request. Automerge then merges it as any Dependabot pull request.

```yaml
jobs:
  build:
    permissions:
      contents: read
      pull-requests: read
    steps:
      - uses: datacrash-io/.github/actions/chaos-guard@main
        with:
          owner: <owner login>
      - uses: actions/checkout@<sha>
```

- `.github/workflows/reusable-claude-review.yml`: advisory PR review run by
  `claude-review/review.mjs` on the Claude Agent SDK: one review with inline comments. Not
  `anthropics/claude-code-action`, because that runs Claude Code, which API credits granted with
  a Claude plan don't cover. The agent reads the repo but has no shell and no GitHub token; the
  script posts its findings. Inputs: `model` (empty = claude-sonnet-5-5; callers pass `vars.CLAUDE_REVIEW_MODEL`), `max_turns`, `max_budget_usd` (default 1),
  `extra_instructions`, `hold_on`, `hold_label`, `label_mode`.
  **Review labels** (`label_mode: review`, the default): after each review of the current head
  the PR carries exactly one of these, and the other three are removed:

  | Label | Meaning |
  |---|---|
  | `review:lgtm` | verdict `looks good` |
  | `review:minor` | verdict `minor issues` |
  | `review:changes` | verdict `needs changes` |
  | `review:missing` | no review could run on this head (no credential, an API error, a timeout) |

  A label the repository lacks is created with a fixed colour and description. The automerge
  workflow refuses the labels in its `blocking_labels` (default: all but `review:lgtm`), so an
  unreviewed head never becomes mergeable. `hold_on` (default `needs changes`; add
  `minor issues` for a stricter repo) names the verdicts the review's comment calls blocking;
  keep it in line with automerge's `blocking_labels`. In this mode the review never adds
  `hold`; it still lifts a `hold` it placed itself earlier once a verdict outside `hold_on`
  comes in, so a PR held before the switch is released by a clean re-review.
  **Hold** (`label_mode: hold`, the earlier behaviour): when the verdict is in `hold_on`, the
  review adds `hold_label` (default `hold`), which the automerge workflow refuses to merge, and
  a review that can't finish also holds the PR when `hold_on` is set; the next completed review
  lifts it. No `review:*` labels are set.
  A PR from a fork fails this check (it can be neither reviewed nor labelled), so automerge
  refuses it. The verdict is never milder than the review's own still-open findings (an open
  high/medium means `needs changes`). Callers trigger on `synchronize` too, so every push is reviewed (automerge waits for that check on
  the current head; a run for a head the PR has already left exits before calling the model); a review that
  finishes after a newer push leaves the labels to the newer review. A `hold` a person
  added is never removed. **Threads:** each run re-checks the review's own open inline
  threads against the current code, resolves the fixed ones with a reply naming the commit,
  and keeps still-valid ones open without re-posting them. To dismiss a finding, reply in its
  thread with the concrete reason it's intended; the next review checks that reason against the
  code and, if it holds, resolves the thread as accepted. A person's threads are never touched.
  **Incremental:** each review ends in a hidden `<!-- claude-review sha=... verdict="..." -->`
  marker. A marker counts only when this review job's own check on that commit succeeded,
  came from the same caller workflow calling this workflow at `main`, and recorded that it
  posted a review. When the last such review covered an ancestor of the current head, the next run
  reviews only the PR's files changed since that commit, with the earlier review and its open
  threads as context, and its verdict still covers the whole PR. It reviews the whole PR again
  when there is no marked review, after a force-push or rebase, on a re-run of the job, or when
  the PR touches `.github/`, when any commit since the reviewed one touched `.github/`, or
  when a changed path can't be parsed. **Enabling it takes two steps, in this order:** (1) every
  caller adds `actions: read` and `checks: read` to its `claude-review` job's `permissions:`;
  (2) then the `review` job here requests them too. Until step 2 the job's token can't make
  those lookups, so every review is a full one. Doing step 2 first would stop every caller
  that doesn't grant them from starting. To override, remove the blocking label and re-run the automerge job. Never fails
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
jobs:
  gitleaks:
    uses: datacrash-io/.github/.github/workflows/reusable-gitleaks.yml@main
  claude-review:
    # Every push is reviewed: automerge waits for this check on the current head.
    if: github.event_name == 'pull_request'
    # The review job narrows these to contents: read + pull-requests: write +
    # id-token: write (federation). contents: write is used only by the separate
    # job that resolves the review's fixed threads; it runs no PR code.
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    uses: datacrash-io/.github/.github/workflows/reusable-claude-review.yml@main
    with:
      # Empty = the shared default (claude-sonnet-5-5). Switch one repo without a PR:
      #   gh variable set CLAUDE_REVIEW_MODEL -R datacrash-io/<repo> -b claude-haiku-5-5
      model: ${{ vars.CLAUDE_REVIEW_MODEL }}
      hold_on: 'needs changes,minor issues'
      # Identifiers, not secrets. Keep them in the private caller, not in this repo.
      anthropic_federation_rule_id: fdrl_...
      anthropic_organization_id: <organization uuid>
      anthropic_service_account_id: svac_...
```
