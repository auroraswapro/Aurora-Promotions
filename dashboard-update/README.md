# Update for the Aurora Promotions Dashboard (aurorapromotions/dashboard)

`projects-and-branding.patch` upgrades the dashboard's **Projects** page with the Aurora team
tracker features and adds Aurora Promotions branding (AP logo, white + lavender). It changes only:

- `docs/projects/index.html`: new Overview, My tasks (progress sliders, ✓ Done), Board with a
  Blocked column, project cards, Team view. Same Firestore data and security rules as before.
- `docs/assets/core.css`, `docs/assets/core.js`: brand colours, logo in the top bar and sign-in
  card, browser-tab icon.
- `docs/assets/logo.png`, `favicon.png`, `apple-touch-icon.png`: the AP logo.
- `docs/handbook/index.html`, `CLAUDE.md`: notes describing the above.

No Firebase or security-rule changes are needed.

## Applying it

In a clone of `aurorapromotions/dashboard` (on `main`):

```
git am projects-and-branding.patch
git push
```

GitHub Pages republishes the dashboard in about a minute.
