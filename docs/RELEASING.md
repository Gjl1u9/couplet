# Releasing

A release is a tag `v<version>` on `main`, with [Semantic Versioning](https://semver.org/spec/v2.0.0.html) versions. Pushing the tag runs [`publish-release`](../.github/workflows/publish-release.yml), which runs the checks, packages the extension, and publishes a GitHub release with the zip attached and the tag's [`CHANGELOG.md`](../CHANGELOG.md) section as its notes. It fails when the tag is off `main`, differs from `package.json`'s version, or has no section.

## Changelog

Each change a user would notice adds a line under `## [Unreleased]`, written for someone meeting the release, under Added, Changed, Fixed, or Removed.

## Cutting a release

1. On a branch `chore/release-<version>`, set the version, which the extension's manifest takes from `package.json`:

   ```bash
   npm version <version> --no-git-tag-version
   ```

2. In `CHANGELOG.md`, move the entries under `## [Unreleased]` to `## [<version>] - <YYYY-MM-DD>`, and leave `## [Unreleased]` empty above it. Merge entries that a later one undoes or rewrites.
3. Open a pull request titled `chore: release <version>`.
4. After it merges, tag its commit on `main` and push the tag:

   ```bash
   git tag v<version> origin/main && git push origin v<version>
   ```

## After a release

Download `couplet-<version>-chrome.zip` from the GitHub release and upload it in the Chrome Web Store dashboard. The Worker and website still deploy by hand, as in [`LOOKUP.md`](LOOKUP.md).

## The package

The release workflow runs `npm run zip:store`, which builds the package without the manifest's `key`, because the store assigns the ID itself and can refuse an upload that carries it. Without the key, the package loaded unpacked gets a different ID, and Google sign-in fails. Upload the zip from the GitHub release, and test locally with `dist/chrome-mv3` from `npm run build`, which keeps the key. After the first upload, check that the store's ID is `pnjdidlglcbbnfhcnhmhndoakdphhckj`, because the sign-in redirect depends on it.
