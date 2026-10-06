# Releasing the npm package

Releases are started manually from GitHub Actions after a version change is
merged into `main`. The workflow publishes `@datalens-tech/mcp` to npm with the
`latest` dist-tag, then creates a `v<version>` Git tag at the checked commit and
a GitHub Release with generated notes. Only stable versions are supported.

## One-time setup

A package maintainer must configure an [npm trusted publisher](https://docs.npmjs.com/trusted-publishers/)
in the settings of `@datalens-tech/mcp`:

- Provider: GitHub Actions
- Organization: `datalens-tech`
- Repository: `datalens-mcp`
- Workflow filename: `publish.yml` (without the directory)
- Environment: `npm`
- Allow direct `npm publish` if the settings offer an allowed-actions selector

No npm token or GitHub Actions secret is required. Publication uses short-lived
OIDC credentials on a GitHub-hosted runner and includes npm provenance. The
workflow uses Node 24 and npm 11.17.0, which support trusted publishing.

Repository administrators must create the GitHub environment `npm` with
**Deployment branches and tags → Selected branches and tags**, allowing only
the branch `main` and no tags. Binding the npm trusted publisher to this
environment prevents a modified workflow in another branch from bypassing the
workflow's own branch check. Required environment reviewers are optional.

Repository administrators must allow GitHub Actions to run the workflow and
grant the release job `contents: write` and the publish job `id-token: write`.
If repository rules restrict `v*` tag creation, allow this release workflow to
create those tags through the GitHub Releases API. Keep `main` protected and
review version changes before merging. Confirm that the npm publisher settings
are correct before the first release; saving them does not test authentication.

## Prepare and publish

1. On a development branch, run `npm version <version> --no-git-tag-version`
   using a new stable version, and update `CHANGELOG.md`. Commit both
   `package.json` and `package-lock.json` with the changelog.
2. Open a pull request, wait for checks, and merge into `main`.
3. Open **Actions → Publish → Run workflow**, select `main`, and enter the
   exact version from the merged `package.json`. A different branch or a fork
   skips publication. A mismatched version fails validation.
4. Wait for both the `publish` and `release` jobs. Confirm the npm version,
   provenance, `v<version>` tag, and GitHub Release. The checked tarball and its
   manifest are retained as a workflow artifact according to repository retention
   settings.

The workflow runs the existing typecheck, lint, and tests, builds through
`npm pack`'s `prepack` hook, and checks the archive's version, entrypoints,
documentation, executable header, and allowed file list. Source files, tests,
source maps, credentials, and unrelated files are rejected. It publishes the
checked tarball directly rather than rebuilding it during publication.

## Failures and retries

- Failures before publication leave npm unchanged and do not create tags or
  releases. Fix the failed check or configuration, then retry.
- Registry or GitHub API failures stop the workflow. Only an HTTP 404 means
  that a package, tag, or release is absent.
- If a version already exists on npm, its SHA-512 integrity must match the
  checked tarball. A match skips `npm publish` and continues release creation;
  a mismatch fails without overwriting anything. A new version must be newer
  than npm's current `latest`, preventing accidental downgrades.
- If publishing succeeds but a later step fails, use **Re-run all jobs** on
  that original run. This checks the same commit even if `main` has moved.
  A new manual run uses the current commit and can fail against an existing tag.
  Registry visibility can briefly lag a successful publish; rerun after it
  becomes visible.
- An existing tag must resolve to the exact workflow commit, including annotated
  tags. A matching published stable release is preserved. A conflicting tag
  or prerelease requires maintainer investigation before retrying. Draft releases
  may be invisible to the read-only preflight and cause release creation to fail
  after npm publication. Resolve the draft in GitHub, then rerun the original
  workflow to finish the release without republishing the package.
- npm versions are immutable. To correct released code, prepare a new version
  and publish again. Do not delete or move release tags to recover a failed run.

Concurrent publication runs are serialized and an active run is never canceled
by a newer request. GitHub may replace an older pending run with a newer one.
Do not start another version while recovering a partially completed release.
