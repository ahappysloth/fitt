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

Logging a comfortable set above the current target recalibrates untouched later
sets. For example, 20 squats against a target of 10 suggest 18 after **Just right**
or 20 after **Easy**. Meeting the adjusted target does not repeatedly reduce it.
Hard or missed sets can reduce the next suggestion. Completed work, manual
pending inputs, and recommendations established by a newer completed set are
preserved.

Future plans can calibrate from actual performance after a complete, comfortable
exercise at comparable load. Catalog ranges and the existing two-success rule for
harder variations or added load still apply. This is a targeted correction to
performance feedback, not a new training-program model.

## Verification

Rule tests cover calibration, correction/undo ordering, manual overrides, holds,
loads, and clock accounting. Browser coverage exercises builder/review/start,
pause/reload, navigation, offline logging, set editing, and the existing backup,
account, form-guide, and PWA flows on desktop and mobile.
