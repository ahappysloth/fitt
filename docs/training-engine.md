# Training engine: evidence foundation

The training engine runs locally and works offline. This phase improves the
reliability of existing recommendations; it does not introduce a personalized
strength model or a new weekly training program. Programming thresholds remain
product rules rather than validated estimates of physiology.

## Separate the prescription from the result

New sets retain an immutable `prescription` with the starting target, added load,
and generated/manual source. Existing `target` and `targetLoad` represent the
current recommendation. `reps`, `load`, and `done` record the actual result.
`recommendationSource` identifies a starting or adapted suggestion. Editing or
undoing a result does not rewrite its prescription.

An exercise's `plannedSetCount` is captured before training. Adding or removing
sets during a session does not reduce that original commitment. A new session
from a saved routine captures its own starting prescription; the routine itself
keeps its authored targets.

All evidence fields are optional for compatibility. Older history is not given
invented original targets or confirmed effort. It can still inform starting
recommendations. New evidence survives local backup and canonical account JSON;
no database-column migration is needed.

An older client may omit evidence from a full account snapshot. The server
retains already stored evidence only when the existing record's underlying
results, targets, and other core fields are unchanged. Explicit incoming
metadata wins. Edited or deleted records do not silently regain stale evidence,
and restored snapshots must still pass the cloud validation and size limits.

## Effort is optional feedback

The UI starts with no selected rating. The stored legacy `good` value is not an
explicit report unless `effortConfirmed` is true. Legacy Easy/Hard choices can be
recognized as non-default choices when confirmation is absent; an explicit false
confirmation always wins. Retained but unconfirmed values do not activate
Easy/Too hard policies. The journal identifies unrated work honestly.

The three labels are Easy (plenty in reserve), Just right (manageable effort), and
Too hard (comfort or form limited). Logging without a rating still records real
completed work. Complete demonstrated work can recalibrate a starting target;
an additional progression requires explicit comfortable feedback.

## Comparable completed work

The engine orders history by completion timestamp and deterministic ID, and one
session cannot supply multiple exposures through duplicated records or exercise
entries. Two successive comparable exposures must meet their original targets
at the same added load and target vector, complete their planned sets, and supply
enough work for the new prescription. Both must contain explicit comfortable
feedback. Different loads or set counts cannot be combined as two successes.

This prevents one successful session at a newly raised target from immediately
earning the next increase. Two single-set knee push-up sessions cannot unlock
three sets of regular push-ups. Missing or adjusted work is not automatically a
failure, but it is not a full comparable exposure either.

Complete, consistent-load actual performance can recalibrate an underestimated
target separately from progression. Starting three squat sets at ten, logging
twenty and then eighteen, and finishing without the third retains a starting
baseline of ten. Adjusted suggestions are not averaged into the original plan.
Completing all three at twenty/eighteen/eighteen establishes the minimum actual
result as evidence, capped by the catalog range for the next plan. The stock
squat range currently caps that starting target at fifteen; the higher actual
results remain recorded. Within-session feedback still permits twenty followed
by an eighteen-rep suggestion. These catalog ranges need review in the next phase.

Added load is part of the task: completing six reps at ten added kilograms must
not be judged as failing eight reps at five kilograms solely because six is less
than eight. Reduced-load extra reps do not establish higher capacity at the old
load. Variable-load work is not pooled into comparable progression evidence.

## Immediate changes remain predictable

Logging adapts later untouched sets of that exercise, preserving completed work,
manual input, and recommendations established by a later completed set. Valid
manual input sets `targetLocked`, even when numerically equal to the suggestion.
Choosing an effort rating also keeps the entered result it describes.
**Reset to target** appears only when the entered numbers differ from the target.
It restores those numbers and releases the lock without clearing effort feedback.

## Remaining work

Catalog progression links, exercise setup/per-side metadata, and movement coverage
still need dedicated review. Fixed versus adaptive routines should become an
explicit user choice. Time-away handling, longer-term capacity/confidence,
adaptive rest, realistic duration estimates, and weekly volume remain later
phases. Existing muscle labels mix primary and supporting work and must not be
counted as equivalent training sets.

Regression tests cover the evidence rules, corrections, missing feedback,
changed loads, legacy round-trips and chronology. Browser checks exercise the
actual logging and reload flows on desktop and mobile. These checks establish
software behavior; coaching review and training-outcome validation remain part
of developing the subsequent programming policies.
