# Workout flow

Workout navigation opens a builder when there is no active session and returns to
the current session otherwise. Navigation alone never creates a session or starts
its clock. Today, quick-workout, and saved-routine actions go through the review
screen before starting.

## Build and review

The builder starts with equipment-aware suggestions and offers full-body, upper,
lower, and core presets. Movements can be added, removed, reordered, or swapped;
sets, targets, and added load remain editable. The Add/Swap dialog initially uses
the chosen focus, with independent category and muscle filters and an option to
browse outside that focus.

Review presents the lineup, targets, rest periods, and estimated duration without
starting a clock. **Continue to workout** creates fresh session and set IDs and
records the start time. Saving a reusable routine is a separate action.

## Training and pause

The **Log sets** tab prioritizes the current rep/hold card, editable **Your sets**,
and **Coming up**. **Form guide** holds the movement demonstration and instructions
in a separate tab. Logging, editing, undoing, and adding sets retain their existing
data semantics.

Pause state belongs to the device's active session. The optional `pausedAt` and
`pausedSeconds` fields keep older backups compatible. Paused time is excluded from
recorded workout duration, and rest/hold countdowns freeze with the session. An
active-session strip on other pages returns to the workout without changing its
pause state. Only completed training is synced to the account; clock-control
metadata is omitted from the cloud session representation.

## Recommendation feedback

Logging a set above the current target can recalibrate untouched later sets. For
example, 20 squats against a target of 10 suggest 18 after **Just right**, or 20
after **Easy**. Effort starts unselected and is optional. **Too hard** means the
work could not be completed comfortably or with controlled form; ordinary effort
is not automatically a failure. Each explanation appears in the same reserved
space so choosing a rating does not move the log action.

Actual results, original prescriptions, and current recommendations are separate.
Valid manual rep/load input explicitly locks that set even if the value equals
the recommendation. Choosing effort also preserves the result being rated.
**Follow suggestion** restores the suggested values and
allows later automatic changes without clearing the selected effort rating.
Corrections preserve original prescriptions and completed evidence; undoing a
result does not erase its starting target. An added set begins unrated with its
own prescription, rather than inheriting the previous result or feedback.
Removing sets during the session retains the original planned set count.

A complete exercise can conservatively calibrate from demonstrated performance.
Earning an additional progression requires two complete comparable exposures
with explicit comfortable feedback. A partial exercise cannot inflate its
starting prescription by averaging rewritten suggestions. Saved routine targets
remain fixed. See [training engine policy](training-engine.md) for evidence,
compatibility, and remaining programming limits.

## Verification

Rule tests cover calibration, correction/undo ordering, manual overrides, holds,
loads, and clock accounting. Browser coverage exercises builder/review/start,
pause/reload, navigation, offline logging, set editing, and the existing backup,
account, form-guide, and PWA flows on desktop and mobile.
