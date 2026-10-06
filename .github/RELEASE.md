# Releasing the npm package

## One-time setup

- Create the GitHub environment `npm`. Under **Deployment branches and tags →
  Selected branches and tags**, allow only the branch `main`, with no tags
- Configure an [npm trusted publisher](https://docs.npmjs.com/trusted-publishers/)
  for `@datalens-tech/mcp`: GitHub Actions, organization `datalens-tech`, repository
  `datalens-mcp`, workflow `publish.yml`, environment `npm`. Allow direct
  `npm publish` if the settings offer that option
- Allow `id-token: write` for publication and `contents: write` for GitHub Releases.
  If repository rules restrict `v*` tags, allow the workflow to create them
- No npm token or Actions secret is needed. Publication uses OIDC and provenance

## Publish

1. Run `npm version <version> --no-git-tag-version` on a development branch.
   Use a stable version newer than npm `latest`
2. Update `CHANGELOG.md`. Commit it with `package.json` and `package-lock.json`,
   open a PR, wait for checks, and merge into `main`
3. Open **Actions → Publish → Run workflow**, select `main`, and enter that version
4. Wait for both jobs. Check the npm version and provenance, `v<version>` tag,
   and GitHub Release

- The workflow runs typecheck, lint and tests, builds and validates the tarball,
  then publishes that archive. The checked archive is saved as an Actions artifact
- The tag points to the workflow commit. Release notes are generated automatically

## Recover a failed run

- Fix the reported error, then use **Re-run all jobs** on the original run.
  This keeps the original commit even if `main` has moved
- An identical published package is skipped. A matching tag and Release are
  preserved; missing release objects are created. Artifact uploads replace the
  previous artifact, so repeating a completed upload does not block recovery
- If npm visibility lags publication, wait and rerun the original run
- Different package integrity or a conflicting tag stops recovery. npm versions
  are immutable: release changed code under a new version, without moving tags
- A draft Release may only be detected after npm publication. Resolve the draft
  conflict in GitHub, then rerun the original run
- Runs are serialized. Finish recovering one version before starting another
