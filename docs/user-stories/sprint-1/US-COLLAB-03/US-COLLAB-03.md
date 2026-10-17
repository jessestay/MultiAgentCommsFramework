# US-COLLAB-03: Maintain Centralized "Known Issues & Workarounds" Document

As an AI Team Member,
I want to consistently use and update the `docs/technical/KNOWN_ISSUES.md` document when persistent environmental quirks or tool bugs are encountered and workarounds are found,
So that the team avoids re-diagnosing known, tricky problems repeatedly and has a central place to find solutions for them.

## Business Value
Saves significant time and effort by providing a quick reference for known problems and their solutions. Improves team efficiency by preventing repeated troubleshooting of the same issues. Centralizes knowledge about environmental or tool-specific challenges.

## Acceptance Criteria

1.  **AC1: Consulting KNOWN_ISSUES.md First**
    *   GIVEN an AI role encounters a persistent or tricky technical issue (e.g., tool failure, unexpected environmental behavior)
    *   WHEN beginning to troubleshoot
    *   THEN the role (especially SET or ES coordinating) MUST first consult `docs/technical/KNOWN_ISSUES.md` to see if the issue or a similar one is already documented with a workaround.

2.  **AC2: Documenting New Known Issues and Workarounds**
    *   GIVEN a new persistent environmental quirk or tool bug is encountered
    *   AND a reliable workaround is identified after troubleshooting
    *   WHEN the workaround is confirmed
    *   THEN ES or SET MUST ensure that the issue, its symptoms, affected tools/versions, and the successful workaround are documented in `docs/technical/KNOWN_ISSUES.md` under an appropriate category.
    *   AND the entry MUST include the date it was last updated.

3.  **AC3: Updating Existing Entries**
    *   GIVEN an existing entry in `docs/technical/KNOWN_ISSUES.md` is found to be outdated (e.g., workaround no longer effective, issue resolved by tool update)
    *   WHEN this is discovered
    *   THEN the relevant AI role (ES or SET) MUST update the entry with the new status, revised workaround, or resolution information, and update the "Last Updated" date.

4.  **AC4: Referencing KNOWN_ISSUES.md in Communication**
    *   GIVEN `docs/technical/KNOWN_ISSUES.md` contains relevant information for a current task or problem
    *   WHEN discussing the task or problem
    *   THEN AI roles SHOULD reference the relevant section of `docs/technical/KNOWN_ISSUES.md` (e.g., "@SET, please check `docs/technical/KNOWN_ISSUES.md#powershell-buffer-issue` for the workaround on this.")

## Technical Notes
*   The `docs/technical/KNOWN_ISSUES.md` file was created as part of the initial setup.
*   This user story focuses on the *ongoing process* of using and maintaining this document.
*   Clear, concise, and actionable entries are key to the document's usefulness.

## Tasks
1.  [ ] All AI roles (especially ES and SET) to make it a habit to consult `docs/technical/KNOWN_ISSUES.md` when facing difficult issues.
2.  [ ] ES and SET to take responsibility for adding new entries or updating existing ones as soon_as a new known issue/workaround is confirmed.
3.  [ ] Periodically review `docs/technical/KNOWN_ISSUES.md` for outdated information (e.g., during sprint retrospectives).

## Definition of Done
1.  The process for using and maintaining `docs/technical/KNOWN_ISSUES.md` is documented in this user story.
2.  AI roles demonstrate they consult the document when troubleshooting relevant issues.
3.  New known issues and their workarounds encountered during the sprint are added to the document by ES or SET.
4.  Behat feature file `tests/features/sprint-1/US-COLLAB-03.feature` exists and outlines scenarios for this process. 