# Maintaining this fork

This fork tracks the original openGym (`DuarteSantos8/openGym`, AGPL-3.0-or-later) and adds its own changes.

## Remotes

| Remote     | Purpose                                              |
|------------|------------------------------------------------------|
| `origin`   | your fork on GitHub (add it: `git remote add origin <url>`) |
| `upstream` | the original project; push is disabled               |

## Naming

The fork is called **myGym**. `scripts/rebrand.sh` rewrites only the visible word "openGym" and skips upstream URLs, licence and credit lines. Lowercase identifiers (`opengym-*` storage/file names, `OPENGYM_*` env vars, the MCP name, compose project name) are deliberately unchanged: renaming them would orphan existing user data. After a merge, run the script, review `git diff`, commit.

## Rules that keep merges painless

1. **Fork identity lives in `frontend/src/lib/branding.js`.** Don't hardcode the repo or name elsewhere.
2. **Prefer adding files over editing upstream ones.** New views/components/lib helpers never conflict; edits to `useStore.js`, `server.js` or `Settings.jsx` do. When you must edit, keep the hunk small.
3. **Work on feature branches off `custom`**, never on `main`. Keep `main` as a pure mirror of `upstream/main`.
4. New training logic still needs a unit test beside it (upstream's rule; it also protects you after merges).

## Sync routine

```bash
git fetch upstream
git checkout main && git merge --ff-only upstream/main   # mirror, never diverges
git checkout custom && git merge main                    # resolve conflicts once; rerere remembers them
sh scripts/rebrand.sh                                    # re-applies the myGym name to anything new upstream added
cd frontend && npm test && cd ../api && npm test && cd ../mcp && npm test
```

Use `git log custom..main --oneline` first to see what's incoming, and read upstream's `CHANGELOG.md`. Check especially for changes to the persisted state shape (`gym_state_v1`) and `data/` file formats before deploying over real data.

Optional: a scheduled GitHub Action can open a PR from `upstream/main` weekly so you never drift far.

## Licence obligations (AGPL-3.0)

- Keep `LICENSE`, the copyright notices and `NOTICE.md`; add your own copyright line for your changes.
- Anyone using your hosted instance must be able to get your modified source (the Settings footer links it).
- Mark your changes as changed from the original; credit upstream (done in Settings via `UPSTREAM_REPO`).
- **Exercise media is licensed "for use in openGym only"** (see `NOTICE.md`). It is not covered by the AGPL grant. A renamed fork must not redistribute those assets without its own permission from the rights holder; use your own or openly licensed media.
- The "App store exception" in `NOTICE.md` is the upstream author's grant; check it applies before publishing to stores.
- Upstream's name and icons: if you diverge meaningfully, rename and re-brand to avoid confusion.
- CI here pushes to a GitLab mirror and signs the APK with upstream's secrets; disable or replace `.github/workflows/mirror.yml`, `docker-publish.yml`, `cla*.yml` in your fork.
