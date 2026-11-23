# Publishing Checklist

The repository is prepared for a public GitHub repository and an npm package, but nothing has been published. These steps are for the owner, in a separate decision. Replace `OWNER` everywhere with the GitHub account.

## Before Publishing

1. Replace `OWNER` in `README.md`, `.claude-plugin/marketplace.json`, `scripts/skill-toolkit.mjs` (then run `npm run sync:skills`), `scripts/write-schema.mjs` and `package.json` (add `repository`, `homepage` and `bugs` fields)
2. Set the copyright holder in `LICENSE` if you want your name instead of "doodle-video-generator contributors"
3. Run `npm test`, `npm run validate:skills` and `npm run check:repo`

## GitHub

```bash
git remote add origin git@github.com:OWNER/doodle-video-generator.git
git push -u origin main
git tag v0.1.0
git push origin v0.1.0
```

## npm (Optional but Recommended)

Publishing to npm lets `toolkit.mjs install` work with no flags.

```bash
npm login
npm publish --access public
```

The published package contains `dist/`, so installs don't need a build.

## Installing the Toolkit From GitHub

`npm install github:OWNER/doodle-video-generator#v0.1.0` builds the package from source: npm clones it, installs the development dependencies and runs `prepare` while packing it. This was verified with a local Git URL (`git+file://…#main`) and npm 11.20, which built `dist/` and printed an install-scripts warning about `prepare` that needs no action. Installing from npm or from a tarball made with `npm pack` needs no build.

## skills.sh

After the repository is public, `npx skills add OWNER/doodle-video-generator --list` should list four skills. skills.sh builds its pages from install telemetry, so the listing appears after people install the skills; it is not immediate or guaranteed.
