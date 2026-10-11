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
