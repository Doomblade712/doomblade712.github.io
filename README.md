# Malik Danab — Portfolio

Personal portfolio site (gameplay programming / technical design), rebuilt as a static
[Astro](https://astro.build) site from the original Adobe Portfolio version at
`malikdanab.myportfolio.com`. Hosted for free on GitHub Pages.

## Working on the site locally

```powershell
npm install        # first time only
npm run dev        # dev server at http://localhost:4321
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

Where things live:

| What | Where |
| --- | --- |
| Pages (one file per page) | `src/pages/*.astro` |
| Shared header/footer/nav | `src/layouts/Layout.astro` |
| Social icon links | `src/components/SocialLinks.astro` |
| All styling | `src/styles/global.css` |
| Images | `public/images/` |

To add a new project: drop a cover image + screenshots into `public/images/`, create
`src/pages/my-project.astro` (copy an existing detail page like `foursight.astro`),
and add an entry to the `covers` array in `src/pages/projects.astro` or `gamejams.astro`.

## First-time deployment to GitHub Pages

The repo already contains a GitHub Actions workflow (`.github/workflows/deploy.yml`)
that builds and publishes the site on every push to `main`. One-time setup:

1. **Create the repo on GitHub** (logged in as `Doomblade712`):
   go to https://github.com/new and name it exactly **`doomblade712.github.io`**
   (public, no README/gitignore — the project already has them).

2. **Push this folder to it:**

   ```powershell
   git remote add origin https://github.com/Doomblade712/doomblade712.github.io.git
   git push -u origin main
   ```

3. **Enable Pages:** on GitHub go to the repo → **Settings → Pages** and set
   **Source** to **GitHub Actions**. The workflow run from your push (visible under
   the **Actions** tab) will publish the site at **https://doomblade712.github.io**
   within a minute or two. If the first run failed because Pages wasn't enabled yet,
   just re-run it from the Actions tab.

After that, deploying = committing and pushing. No other steps.

## Adding a custom domain (optional, ~$10–12/yr)

1. Buy the domain at an at-cost registrar — [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)
   (~$10.50/yr for a .com) or [Porkbun](https://porkbun.com) (similar). Avoid GoDaddy
   (cheap first year, expensive renewals).
2. In the GitHub repo: **Settings → Pages → Custom domain**, enter the domain
   (e.g. `malikdanab.com`) and save. Check **Enforce HTTPS** once it's verified.
3. At the registrar, add DNS records:
   - `CNAME` record: host `www` → `doomblade712.github.io`
   - For the apex/root domain, either an `ALIAS`/`ANAME` record to
     `doomblade712.github.io`, or `A` records to GitHub Pages' IPs:
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
4. Update `site` in [astro.config.mjs](astro.config.mjs) to the new domain and push.

## Known limitations

- **Video embeds** on the InVein and FourSight pages are Adobe Creative Cloud Video
  players carried over from the old site. They keep working as long as the Adobe
  subscription stays active — if it lapses, re-upload the clips to YouTube and swap
  the iframe URLs in `src/pages/invein.astro` and `src/pages/foursight.astro`.
- **The contact form** opens the visitor's email app pre-filled (a `mailto:` link) —
  a static site has no server to send mail itself. For real in-page sending, sign up
  at [Formspree](https://formspree.io) (free tier) and point the form's `action` at
  the endpoint they give you.
- The old Adobe home URL path `/malik-danab` redirects to the home page so existing
  links keep working (configured in `astro.config.mjs`).
