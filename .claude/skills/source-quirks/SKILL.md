---
name: source-quirks
description: Known structural failure modes of specific data sources (e.g. ESPN mis-dating F1 weekends) and how to compensate. Read before trusting a source's dates/status/coverage for the current round; append a new entry when you confirm a repeated, mechanistic quirk. Use during verification, coverage audits, and research.
---

# Playbook: source quirks — how our sources lie, and how to compensate

Some sources are not just occasionally wrong — they are wrong in a **specific,
repeatable, mechanistic way**. That structural knowledge is different from the
calibration ledger:

- **`calibration.json`** answers *how much* to trust a source (a percentage, from
  `verify`'s per-check ledger). Quantitative.
- **This skill** answers *how* a source fails and *what to do about it*. Qualitative,
  mechanistic, actionable. It tells an agent to compensate **before** the failure
  reaches the board — a percentage can't do that.

**Read this** before trusting any single source's dates, status, or coverage for the
current/imminent round — especially for API-fed sports (football, golf, tennis, F1)
where a silent mis-date looks like correct data.

## The bar for adding an entry (keep this skill sharp, not noisy)

Only add an entry when ALL of these hold:
1. **Structural, not a one-off.** There is a mechanism (a source dates events to the
   wrong session; a feed omits a category; an API marks things FINAL early). A single
   wrong value is a calibration-ledger data point, not a quirk — record it there.
2. **Observed ≥2×, or the mechanism is unambiguous** from one clear case.
3. **You can state the compensation** — what a future agent should DO to avoid it.
4. **Dated + evidenced.** Include the date you confirmed it and a source URL.

If a quirk stops reproducing (the source fixed it), mark the entry `RESOLVED <date>`
rather than deleting it — the history is useful.

## Entry format

```
### <Source> — <scope> (<severity>)
- **Quirk:** what the source does wrong, mechanistically.
- **Symptom on the board:** how it shows up in our data / to the user.
- **Compensate:** the concrete action to take instead.
- **Observed:** <date(s)>, <count>. **Evidence:** <url>.
```

---

## Known quirks

### ESPN F1 scoreboard — race weekends (high)
- **Quirk:** ESPN stamps a Grand Prix weekend at the **Friday** practice session and
  can mark it `STATUS_FINAL` before the race is run. Our `f1.js` adapter fetches the
  whole season and the base adapter filters `date > now − 4h`, so the weekend that is
  *happening right now* is dated to Friday and **drops off the board by Saturday**,
  while future races (dated to their own Fridays) survive.
- **Symptom on the board:** during a race weekend, the current Grand Prix is missing
  while later ones are present — the board looks "covered" (2+ future F1 races) but
  *this weekend's* race is gone.
- **Compensate:** for F1 in season, do **not** trust ESPN's date/status for the
  current or next weekend. Confirm each against `formula1.com` (or the official F1
  calendar) directly, and treat the race day (Sunday) + session times from there as
  ground truth. The coverage-critic must check this every run.
- **Observed:** 2026-07-05 (British Grand Prix, Silverstone, race Sun 5 Jul — absent
  from the board; only Belgian 17 Jul + Hungarian 24 Jul present).
  **Evidence:** https://www.formula1.com/en/racing/2026
