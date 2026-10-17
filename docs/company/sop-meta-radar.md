# SOP: Meta Radar (changelog radar)

Jesse is becoming THE Muse expert. This SOP is how the team stays visibly
current — tracking Meta/Muse API and platform changes, testing new
capabilities on day one, and turning learnings into content the same week.

## Owners

- **CTO:** technical evaluation — what changed, what it enables, what breaks.
- **CCO:** content packaging — demo, writeup, workshop module.

## The radar

Monitored continuously (CTO loop):

1. Meta developer changelog and API announcements (dev.meta.ai, api.meta.ai
   docs, Meta for Developers blog).
2. Muse platform updates and new model releases.
3. Breaking changes and deprecations affecting our integrations
   (gateway, DM concierge, Bacon, Facebook Expert tooling).

## Day-one protocol

When something material ships:

1. **CTO (same day):** read the changelog, test the capability against our
   stack, note what it enables and what it breaks. Time-box: 2 hours.
2. **CTO (day 1–2):** build a small working demo — the smallest thing that
   proves the capability is real.
3. **CCO (same week):** package it — demo video or screenshots, short
   writeup (problem → what's new → what it means), one workshop module or
   content piece derived from it.
4. **CMO:** ship the packaged piece through the content pipeline; it must
   reinforce the category (Jesse = THE Muse expert).

## Proof portfolio feed

Every radar item that ships becomes a candidate proof asset under the Proof
Portfolio epic (checklist: demo, writeup, workshop module, published where
prospects see it).

## Rules

- A radar finding with no demo is a rumor — test before packaging.
- Breaking changes get a Vikunja task immediately (owner: CTO) with
  severity and affected integrations; Jesse is pinged only if his action
  is required.
- The radar never speculates about unreleased products as fact.
