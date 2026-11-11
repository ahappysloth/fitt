# Training goals and progression

Settings → Your rhythm asks for a training goal. The goal changes rep ceilings, sets,
session size and rest. Parameters live in
`src/lib/goals.ts`; prescriptions in `src/lib/workout.ts`.

| Goal               | Ceiling   | Movements × sets (20 / 30 / 45 min) | Rest  |
| ------------------ | --------- | ----------------------------------- | ----- |
| Build muscle       | 20 (60 s) | 3×3 / 5×3 / 6×3                     | ×1.2  |
| Get stronger       | 8 (30 s)  | 2×3 / 3×3 / 4×3                     | ×2    |
| Lose fat & get fit | 15 (45 s) | 4×3 / 5×3 / 6×4                     | ×0.75 |
| Stay healthy       | 15 (45 s) | 4×2 / 5×3 / 6×3                     | ×1    |

Goals keep each movement's own starting point and set the ceiling: the lower of
the goal ceiling and the movement's catalog maximum is where a harder variation (or
added load) takes over. Rest is the movement's base rest times the
goal multiplier, rounded to 5 s and kept between 30 and 240 s. Existing profiles
without a goal default to Stay healthy (beginner) or Build muscle (intermediate).

## Progression

Goals change ceilings, session size and rest; they do not change how targets rise
or fall. That follows the evidence rules in [training-engine.md](training-engine.md):
effort feedback is optional, an increase needs two comparable, comfortably rated
sessions at the same target and load, and "Too hard" or a missed original target
lowers the next plan. On top of those rules:

- A target never drops below the movement's minimum: the easier variation (skipping
  rungs that need missing equipment) or the bottom of the range is used instead.
- A set logged at zero is a skipped set. It doesn't lower later sets or count as a
  one-rep result, and it keeps the exercise from counting as complete work.
- At the top of the goal's range, the next _available_ harder variation follows;
  without one, a weighted vest adds 2.5 kg (5 kg for squat and hinge patterns) and
  the target drops three reps rather than to the bottom of the range.

## Find your level

The first time a movement appears, set 1 is a level set: do clean reps (or hold)
until about two reps (five seconds) are left, then log the result. The remaining
sets that session become 85% of it, rounded (holds to 5 s), capped at the top of
the goal range. If that level is already above the range, the next session starts
the next available harder variation. The flag is stored on the set (`calibration`)
and syncs with history; older builds ignore it. A level set logged below the
movement's minimum is treated like a missed target, so the next session regresses.

## Returning after a break

After two weeks or more away from a movement, its next target restarts at 90% of
the last prescription (80% after six weeks), rounded (holds to 5 s) and never
below the movement's minimum, with the vest one step lighter per threshold. That
session awards no progression; the usual evidence rules resume from it. When the
app opens with a Today plan two or more weeks old and no workout in progress, it
rebuilds the plan and says so. The 14/42-day thresholds and percentages are
judgement calls informed by detraining research, not validated estimates.

## Stalled progress

Increases need explicit comfortable ratings, so someone who logs without rating
could repeat a target indefinitely. When the last three sessions of a movement met
the same targets at the same load but weren't all rated comfortably, the note asks
for a rating ("Easy or Just right moves you on"); the evidence rule itself is
unchanged. At the top of a range with no available harder variation and no vest,
the note suggests a three-second lowering (or a vest, for vest-loadable
movements); holds get a stricter-position cue instead.

## Session planning

When a goal's session holds fewer movement patterns than the focus covers, the
patterns trained longest ago are chosen first, so short sessions rotate through
squat, push, pull, hinge, shoulder and core instead of always dropping the last
ones.

## Evidence and judgement calls

Summarised from the algorithm review (citations from the reviewer's knowledge, not
re-verified): hypertrophy is similar from roughly 5–30 reps when sets end near
failure (Schoenfeld 2017, 2021); proximity to failure matters more for hypertrophy
than strength (Refalo 2023; Robinson 2024); RIR ratings are usable but novices
under-estimate by about a rep (Zourdos 2016; Halperin 2022); longer rest preserves
volume (Schoenfeld 2016; Singer 2024). Fat loss is driven mainly by diet — Settings
says so plainly. The exact windows, multipliers and session sizes are judgement
calls informed by that evidence.

## Not yet implemented

Recommended by the review and left for follow-up: new movements to close ladder dead ends (decline/archer push-ups,
dips, rows that lead to pull-ups, step-ups, single-leg RDLs, L-sits), weekly volume
targets per pattern with upper/lower splits at 4+ sessions a week, optional
deload suggestions, conditioning
finishers for the fat-loss goal, using a swapped-in movement's own history, and a
one-time "Choose your goal" card for people who set up before goals existed.
