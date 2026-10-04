# Spec Delta

## Purpose

Keep the futsal dataset current with a single automatic refresh per day at 03:00 Montevideo time. Visitors never see partial, inconsistent or broken data, even when the source misbehaves.

## ADDED Requirements

### Requirement: Daily schedule at 03:00 Montevideo time
The production deployment SHALL trigger the refresh automatically once per day at 03:00 America/Montevideo time. Uruguay has used UTC−03:00 year-round, without daylight saving time, since 2015, so this equals 06:00 UTC.

#### Scenario: Scheduled trigger time
- **WHEN** the production deployment is running on any day
- **THEN** the refresh is triggered at 03:00 America/Montevideo (06:00 UTC), and at no other scheduled time that day

### Requirement: At most one refresh per day
The system SHALL complete at most one successful refresh per America/Montevideo calendar day, regardless of how many times it is triggered. A trigger arriving after that day's successful refresh SHALL exit without contacting the source, unless an operator explicitly forces it. Two refreshes SHALL never run concurrently. A failed run SHALL NOT count as that day's refresh, but it SHALL NOT be retried automatically; an operator may re-run it manually.

#### Scenario: Second trigger on the same day
- **WHEN** a refresh already completed successfully at 03:05 and the refresh is triggered again at 10:00 the same day
- **THEN** the second run exits immediately without sending any request to the source
- **AND** it records a "skipped: already refreshed today" entry

#### Scenario: Overlapping trigger
- **WHEN** a refresh is triggered while another refresh is still running
- **THEN** the new run exits immediately without changing any data

#### Scenario: Operator forces a refresh
- **WHEN** an operator runs the refresh with the explicit force option on a day that already had a successful refresh
- **THEN** the refresh runs normally

### Requirement: Incremental refresh scope
Each daily refresh SHALL:
- re-list the active seasons and fetch the full details of every match that is new, whose listing data (score, date, venue or teams) changed, or that was played within the last 14 days, so that late-loaded scorers and cards are picked up. Active seasons are the newest season listed by the source plus any season with matches dated within the last 60 days or in the future;
- re-fetch the official standings of the phases in active seasons;
- re-verify one historical season per run in rotation, the season verified least recently first, so that corrections to old data are detected within one full rotation;
- detect and ingest a newly listed futsal season automatically.

#### Scenario: New result published
- **WHEN** the source publishes the score of a match played yesterday
- **THEN** after the next daily refresh the match, standings, player and team statistics and leaderboards include that result

#### Scenario: Late-loaded scorers
- **WHEN** scorers for a match played 5 days ago are added at the source after that match's first ingestion
- **THEN** the next daily refresh ingests those scorers and reduces that match's unattributed goals accordingly

#### Scenario: Correction to an old season
- **WHEN** the source corrects a score in a 2012 match
- **THEN** the correction is ingested no later than the end of the next full rotation over historical seasons

#### Scenario: New season appears
- **WHEN** the source starts listing season code 114 with FUTSAL
- **THEN** the next daily refresh ingests season 2027 without any configuration change

### Requirement: Atomic publication and dataset versioning
A refresh SHALL publish its changes atomically. Until the refresh completes successfully, every page and API response SHALL reflect the previous dataset in full. On success, the new data and all recomputed statistics SHALL become visible together, and the dataset version SHALL increase. On failure, the dataset version SHALL stay the same and no partial changes SHALL be visible.

#### Scenario: Reads during a refresh
- **WHEN** a visitor loads a team page while a refresh is in progress
- **THEN** the page shows the team's data and statistics exactly as of the previous successful refresh

#### Scenario: Failed refresh leaves data untouched
- **WHEN** a refresh fails after fetching half of the changed matches
- **THEN** none of the fetched changes are visible
- **AND** the dataset version is unchanged

### Requirement: Statistics rebuild and cache invalidation
After the data of a successful refresh is committed, the system SHALL rebuild every derived statistic (totals, per-season breakdowns, standings computations, streaks, milestones, leaderboards, champions and coverage figures) before the new version becomes visible. Responses cached under the previous dataset version SHALL stop being served as current.

#### Scenario: Consistent statistics after a refresh
- **WHEN** a refresh ingests a new attributed goal for a player
- **THEN** immediately after the new version becomes visible, the match page, the player's totals and the goals leaderboard all include that goal

#### Scenario: Cached response invalidated
- **WHEN** a client re-requests a resource it cached under the previous dataset version
- **THEN** it receives the content of the new version rather than a "not modified" answer for the old content

### Requirement: Source failure handling
A refresh SHALL abort without publishing when the source is unreachable, or when more than a configurable share of its requests fail after retries (default 20%). The previously published dataset SHALL continue to be served.

#### Scenario: Source down at 03:00
- **WHEN** the source does not respond during the scheduled refresh
- **THEN** the refresh ends with a failed status after its retries
- **AND** the site continues to serve the previous dataset with its original "last updated" time

### Requirement: Run history and freshness reporting
Every refresh attempt SHALL be recorded with:
- start and end time and the trigger (scheduled or manual);
- status: succeeded, failed or skipped;
- counts of matches added and updated;
- failure details.

A failed run SHALL end with a non-zero exit status and write an error entry to the operator log. The time of the last successful refresh SHALL be available to the website.

#### Scenario: Last update shown
- **WHEN** the last successful refresh finished on 2 October 2026 at 03:12 Montevideo time
- **THEN** the website reports the data as updated at that date and time

#### Scenario: Failure is visible to the operator
- **WHEN** a refresh fails
- **THEN** the process exits with a non-zero status and the failure reason is written to the log

### Requirement: Operator commands
Operators SHALL be able to run the following on demand:
- a full historical backfill;
- a refresh of one specific season;
- a forced daily refresh;
- a statistics rebuild without contacting the source;
- a re-normalization from the raw archive.

Each command SHALL respect the no-concurrent-runs rule.

#### Scenario: Rebuild statistics only
- **WHEN** an operator runs the statistics rebuild command
- **THEN** all derived statistics are recomputed and published as a new dataset version
- **AND** no request is sent to the source
