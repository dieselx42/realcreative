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

### Phase 1 — Conversion & positioning ✅ *(shipped)*
- [x] **Competitor benchmarking** *(M)* — `src/lib/scanner/competitors.ts` pulls
  nearby same-category restaurants via DataForSEO, shows your rating vs the local
  average + your rank, and lists the top competitors. *Owner's grader leans on
  "outperform local competition."*
- [x] **Revenue-impact framing** *(M)* — `src/lib/scoring/revenue.ts` translates
  gaps into an estimated $/month range (marketplace commissions, orders lost to a
  slow site, uncaptured repeat orders), grounded in the review count as a volume
  proxy, with assumptions surfaced.
- [x] **Teaser score + email gate** *(M)* — landing collects only name/URL/city;
  the report shows score + competitor + revenue first, and gates the Top-5 action
  plan behind the contact capture (`LeadCaptureForm`). Lead is created at the gate.
- [x] **Book-a-call CTA** *(S)* — CTA links to `NEXT_PUBLIC_CALENDLY_URL` when set,
  else falls back to mailto.
- [x] **Goal quiz qualifier** *(S)* — one-question goal selector on the landing
  form; highlights the matching category ("Your focus") and rides along to the lead.

### Phase 2 — Scan depth (more accurate & specific)
- [x] **Multi-page crawl** *(M)* — `crawl.ts` follows the menu/order links and
  crawls those pages too, merging findings so ordering CTAs/providers on a
  subpage aren't missed (verified: Toast detected on a menu subpage).
- [x] **Ordering-provider detection** *(M)* — identifies the specific provider
  (Toast / ChowNow / Square / Olo / DoorDash / Uber Eats / Grubhub / …), labels
  direct vs marketplace, and feeds the revenue math.
- [x] **Deeper Google profile** *(partial)* — photo count + hours completeness
  added to Local SEO (from the existing DataForSEO response, no extra call).
  *Still to do: review-response rate + review recency — needs the DataForSEO
  reviews endpoint (an extra paid call keyed on the matched cid/place_id).*
- [ ] **Real social presence check** *(S)* — verify IG/FB exist and grab follower
  counts, not just "link present." *Deferred — follower scraping is brittle/blocked.*
- [ ] **Directory/NAP consistency** *(L)* — check name/address/phone across
  major directories (DataForSEO business listings). *Deferred.*

### Phase 3 — The deliverable (turn a scan into a leave-behind)
- [x] **Confirm-your-business step** *(M)* — "What we scanned" panel shows the
  homepage + the matched Google listing (rating/reviews + how it matched), so the
  user can confirm the right location was scored.
- [x] **Site screenshot in the report** *(M)* — homepage screenshot via a service
  (thum.io by default, `NEXT_PUBLIC_SCREENSHOT_BASE`), no serverless Chromium.
- [x] **Emailed report + printable PDF** *(L)* — "Print / Save PDF" button with
  print styles (nav/CTA/gate hidden), and an emailed report link on lead capture
  via Resend (`RESEND_API_KEY`, best-effort). *A fully branded server-rendered
  PDF is a future upgrade; browser print covers the leave-behind for now.*
- [ ] **"What good looks like" examples** *(S)* — per-category exemplars so the
  gap is concrete. *Deferred.*

Also completed from Phase 2: **review-response rate + recency** (`reviews.ts`) —
async DataForSEO reviews, best-effort inline, reliable via Trigger.dev.

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
