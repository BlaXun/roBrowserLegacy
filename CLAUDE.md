# Working in this repository

This is **Flux159/roBrowserLegacy**, the roBrowserLegacy fork that [Ragnarok Offline](https://github.com/Flux159/ragnarokoffline.app) builds its game client from. It is not upstream (MrAntares/roBrowserLegacy). For the codebase itself (layout, subsystems, conventions), read [AGENTS.md](AGENTS.md), which comes from upstream.

**On `master` right now?** That's upstream plus this file. The fork's code is on `ragnarokoffline`: run `git switch ragnarokoffline` before you change anything.

## Pull requests go to `ragnarokoffline`, not `master`

| Branch | What it is | Open PRs against it? |
|---|---|---|
| `ragnarokoffline` | The fork's own branch. The app pins commits on it (`config/VENDOR_PINS` in the app repo). | **Yes. Every PR goes here.** |
| `master` | A mirror of upstream's `master`. | **No.** |

GitHub may suggest `master` as the base, because that is the repository's default branch. Change it to `ragnarokoffline` before you open the PR. A PR against `master` drags in every upstream commit that `ragnarokoffline` hasn't merged yet.

How to work:
- Branch from `ragnarokoffline`: `git fetch origin && git switch -c my-change origin/ragnarokoffline`.
- Keep a PR to one change.
- `ragnarokoffline` only moves forward. Releases pin commits on it, so it refuses force-pushes and is never rebased. Newer upstream comes in as a merge of `master` into it, in its own PR.
- To bring your branch up to date, merge or rebase onto `origin/ragnarokoffline`, never onto `master`.
- **Never open PRs to upstream (MrAntares)** from this fork.

## What belongs here

Fixes to the client, and **hook points** that let code outside the client draw or take part:
- `src/Renderer/MapHooks.js`: drawing inside the map renderer (passes, depth, lights, model replacement);
- `src/UI/ScreenHooks.js`: replacing the login, server list, character select and character creation screens;
- `src/UI/ExitHooks.js`: the Esc menu's character select and exit actions.

Effects, screens and features themselves (Graphics+, autologin, the client API `api.*`) are **not** here. They live in the app repo, in its mods and its client patches (`patches/client/`, applied by `scripts/patch-client.sh`). Add a hook here, small and upstream-neutral, and keep the behaviour in a mod.

## Conventions

- **Files use CRLF line endings** (`.gitattributes`: `eol=crlf`). Keep them, and never produce a whole-file diff. A diff that rewrites every line means something changed the line endings.
- **Hooks follow the MapHooks pattern:** `register()` returns an undo function, a hook that throws is switched off and the stock behaviour comes back, and with no hook registered nothing changes.

## Checking a change

- `npm ci`, `npx vitest run`, `npx eslint <files>`, `npx prettier --check <files>`.
- `npm run build:all` builds the client. To test inside the app, point its `config/VENDOR_PINS` at your commit. The app's CI applies its client patches to the pinned commit and builds it, so a hook the patches rely on must keep its name and shape.
