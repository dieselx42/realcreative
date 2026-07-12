# Restaurant Growth Score — Product Roadmap

A working backlog for evolving the Growth Score tool from a functional MVP into a
best-in-class restaurant lead-generation engine, benchmarked against Owner.com.

> **Context:** Our tool is a **top-of-funnel diagnostic** — it scores a
> restaurant's online presence to generate leads (for the agency / a solution).
> Owner.com is both the *solution* our scan points toward **and** a direct
> competitor at the top of the funnel: they run their own free
> [Restaurant Website Grader](https://grader.owner.com/) that feeds their sales
> demo. So they are the benchmark for both the scan experience and the
> conversion mechanics.

---

## Part 1 — Competitive teardown: Owner.com

### What Owner.com is

"The AI growth system for independent restaurants" — an all-in-one platform
(website, commission-free online ordering, email/SMS marketing, loyalty, branded
mobile app, SEO, delivery, CRM). Sold on **ROI and owning your customer data**
vs. bleeding margin to DoorDash/Uber Eats. $120M Series C, ~$1B valuation.

### Their free grader (our direct analog)

`grader.owner.com` — the tool most similar to ours:

- **Input:** just the **restaurant name** (no account, no URL required).
- **Scans:** Google search rankings, reviews, and online directories/profiles.
  ~30-second "Owner AI" scan.
- **Output:** an "online health score" / "Restaurant Grader report" that flags
  errors (missing keywords, incomplete details, unoptimized content), gives
  "tailored insights to **outperform local competition**," and frames fixes as
  recovering "lost sales" / "how much more money your restaurant could make."
- **Funnel:** routes straight into their gated demo (`/demo-thank-you-grader`).
- Their gated demo uses a **quiz qualifier** — pick a primary goal from three:
  (1) drive more customers from Google, (2) maximize sales from existing
  customers, (3) deliver the best ordering experience to regulars.

**Takeaways that shape our roadmap:** lead with a low-friction input, emphasize
**competitor comparison** and **revenue/ROI**, keep the scan fast, and treat the
report as the hook into a booked call.

### Feature-by-feature: Owner.com vs. Restaurant Growth Score

| # | Owner.com capability | Our tool today | Gap / opportunity |
|---|---|---|---|
| 1 | **Free grader** — name-only input, scans rankings/reviews/listings, health score, competitor framing, routes to demo | Score /100 across 7 categories from URL + full lead form; real PageSpeed, crawl, DataForSEO, Claude recs | Add **competitor benchmarking**, **revenue framing**, **teaser score before full form**, **book-a-call** |
| 2 | **AI website builder** (multi-page, SEO, mobile, page-speed); "converts 100% more" | We *measure* website performance (PageSpeed) + crawl homepage | We're the diagnostic; deeper multi-page crawl would sharpen it |
| 3 | **Commission-free online ordering** (upsells, Apple/Google Pay, pickup/delivery/dine-in) | We detect direct-ordering vs. marketplace (crawl) | Detect **which provider** (Toast/ChowNow/DoorDash/UberEats); quantify **marketplace-commission cost** |
| 4 | **Email/SMS marketing automation** (win-back, abandoned cart, holidays, A/B) | We detect email-capture presence (Retention/CRM category) | Score depth of capture/marketing; recommend specifics |
| 5 | **Loyalty / rewards** (points, 20–30% repeat lift) | Retention/CRM category flags loyalty presence | Fine — keep as a scored signal |
| 6 | **Branded mobile app** (85% more repeat orders) | Not measured | Optional: detect app presence; low priority |
| 7 | **Reputation / reviews** (reviews on site; weakly documented as a product) | Reputation category: rating + review count via DataForSEO | Add **review-response rate**, recency, review velocity — a real gap for Owner too |
| 8 | **Local SEO / listings** ("30% more traffic in 28 days") | Local SEO category via DataForSEO GBP (claimed, category, website, NAP) | Add **listing consistency across directories**, GBP photos/posts recency |
| 9 | **AI features** (SEO/marketing optimization, food-image AI, "AI executives" roadmap) | Claude-written recommendations from real findings | Strong. Could add image/menu analysis later |
| 10 | **Analytics / data ownership / CRM** (first-party customer data) | Admin page (placeholder, unauth) | Build a real **lead/admin dashboard** sorted by opportunity |
| — | **Delivery network** (~$7 flat, no markup) | N/A (not our domain) | Use in **revenue framing** (marketplace vs. direct math) |
| — | **ROI/revenue proof** (30%+ direct revenue, commission-savings math, before/after case numbers) | Preview-score copy only | **Biggest gap** — quantify the dollar opportunity |

### Owner.com's specific claims (useful as copy/benchmarks)
- Traffic +~30% in 28 days; websites convert 100% more; ordering at 2–4× rate;
  loyalty/app repeat visits +20–30%; $100M+ orders driven.
- Third-party fees framed as 15–30% commission, "often 30–40% all-in."
- Pricing: Flex $249/mo + 5%/order; Flat-Rate $499/mo; ~$1,000 setup.

---

## Part 2 — Prioritized roadmap

Effort is rough: **S** = <½ day, **M** = 1–2 days, **L** = 3+ days.

### Phase 0 — Done (current state)
- ✅ Lead form → scan → score /100 across 7 categories
- ✅ Real scanners: Google PageSpeed, Cheerio crawl, DataForSEO (Local SEO +
  Reputation, disambiguated by website domain), Claude recommendations
- ✅ Graceful fallbacks + `meta` diagnostics on every signal
- ✅ Deployed on Vercel + Supabase; committed to `main`

### Phase 1 — Conversion & positioning *(highest ROI for lead gen)*
- [ ] **Competitor benchmarking** *(M)* — pull 3–5 nearby same-category
  restaurants via DataForSEO; show "You score 63; nearby taco spots average 78,"
  with a rating/review comparison. *Owner's grader leans on "outperform local
  competition" — this is the most persuasive single addition.*
- [ ] **Revenue-impact framing** *(M)* — translate gaps into dollars: marketplace
  commission cost (orders × avg ticket × ~20–30%), lost-order estimate from slow
  LCP, retention upside. *Owner sells on ROI math; our report should too.*
- [ ] **Teaser score before the full form** *(M)* — accept restaurant name/URL,
  show a partial score instantly, gate the full report + recommendations behind
  the email. *Mirrors Owner's name-only grader; captures far more leads.*
- [ ] **Book-a-call CTA that works** *(S)* — wire "Schedule a Free Growth Review"
  to Calendly/Cal.com instead of a dead button.
- [ ] **Goal quiz qualifier** *(S)* — one question ("What's your #1 goal?") to
  segment the lead and tailor the report emphasis. *Copies Owner's demo quiz.*

### Phase 2 — Scan depth (more accurate & specific)
- [ ] **Multi-page crawl** *(M)* — also fetch menu + order pages, not just the
  homepage; more signals, fewer false negatives.
- [ ] **Ordering-provider detection** *(M)* — identify Toast / ChowNow / Square /
  DoorDash / Uber Eats and quantify marketplace dependency (feeds revenue math).
- [ ] **Deeper Google profile** *(M)* — photo count, posting recency, hours
  completeness, and **review-response rate** + review velocity. *A gap even for
  Owner.*
- [ ] **Real social presence check** *(S)* — verify IG/FB exist and grab follower
  counts, not just "link present."
- [ ] **Directory/NAP consistency** *(L)* — check name/address/phone across
  major directories (DataForSEO business listings).

### Phase 3 — The deliverable (turn a scan into a leave-behind)
- [ ] **Confirm-your-business step** *(M)* — show the matched candidates and let
  the user pick, so reputation data is never attributed to the wrong location
  (builds on the domain-disambiguation we already have).
- [ ] **Site screenshot in the report** *(M)* — Playwright screenshot (Chromium
  already available) of their homepage.
- [ ] **Emailed PDF report** *(L)* — branded PDF with score, screenshot,
  competitor comparison, and a prioritized roadmap (impact × effort).
- [ ] **"What good looks like" examples** *(S)* — per-category exemplars so the
  gap is concrete.

### Phase 4 — Backend & ops (your side)
- [ ] **Admin lead dashboard** *(L)* — replace the placeholder; list leads with
  score, sort by **opportunity** (low score × #locations = hot), search/filter.
  **Add auth first** (currently unauthenticated).
- [ ] **New-lead notifications** *(S)* — email/Slack ping on each submission.
- [ ] **Automated follow-up sequence** *(M)* — drip emails after a scan (reuse
  the Claude recommendations).
- [ ] **CRM export / webhook** *(S)* — push leads to HubSpot/Sheets/etc.

### Phase 5 — Scale & reliability *(when traffic warrants)*
- [ ] **Trigger.dev background scans** *(M)* — move scans off the request path
  (code already in place; see README). Turn on when inline scans get slow or
  traffic grows.
- [ ] **Scraping proxy for bot-protected sites** *(M)* — unblock Cloudflare-
  protected sites the crawl currently 403s on (filed as an issue).
- [ ] **Result caching / rate limiting** *(S)* — avoid rescanning the same site
  repeatedly; protect API budgets (DataForSEO/Anthropic cost per scan).

### Recommended first sprint
**Competitor benchmarking (#1)** + **revenue-impact framing (#2)** — together
they turn a nice score into "I'm losing to the place down the street and it's
costing me $X/month," which is exactly how Owner.com converts. Then the
**teaser-score gate** to lift lead capture.

---

*Sources: Owner.com product/pricing/how-it-works pages, grader.owner.com, and
analyst write-ups (Contrary, Sacra, Sauce), gathered via web research on
2026-07-12. Owner.com serves 403 to automated fetches, so exact on-page form
fields were inferred from search summaries; verify against the live pages before
copying specific UX.*
