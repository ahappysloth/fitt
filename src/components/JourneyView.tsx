'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Award,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Dumbbell,
  Flame,
  Heart,
  Leaf,
  LockKeyhole,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from 'lucide-react'
import { byId } from '../lib/catalog'
import { getRewards, type AwardId } from '../lib/rewards'
import type { Profile, Session, UserPreferences } from '../lib/types'
import { localDay, weekDays } from '../lib/workout'
import { SparkBuddy } from './FittArtwork'
import { Button, Pill, ProgressBar, SectionTitle, Select, Week, XPCard } from './ui'
import './journey.css'

const awardIcons = {
  'first-move': Zap,
  'fresh-start': Flame,
  'back-at-it': Heart,
  'new-territory': TrendingUp,
  'week-winner': Trophy,
  'ten-club': Star,
} satisfies Record<AwardId, typeof Zap>

function calendarDate(day: string) {
  return new Date(`${day}T12:00:00`)
}

function shortDate(day: string) {
  return calendarDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function timeLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export default function JourneyView({
  history,
  profile,
  preferences,
  onTrain,
  onSession,
  onAward,
}: {
  history: Session[]
  profile: Profile
  preferences: UserPreferences
  onTrain: () => void
  onSession: (session: Session) => void
  onAward: (id: string) => void
}) {
  const [now, setNow] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [historyLimit, setHistoryLimit] = useState(6)
  const [recordFilter, setRecordFilter] = useState('all')
  const [recordLimit, setRecordLimit] = useState(6)

  // Keep the local calendar honest when the app stays open overnight or resumes from sleep.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      const date = new Date()
      setNow(date)
      const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
      clearTimeout(timer)
      timer = setTimeout(refresh, midnight.getTime() - date.getTime() + 100)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const rewards = useMemo(
    () => getRewards(history, profile.weeklyGoal, now),
    [history, profile.weeklyGoal, now],
  )
  const sessionsById = useMemo(
    () => new Map(history.map((session) => [session.id, session])),
    [history],
  )
  const latestRecord = rewards.records[0]
  const earnedCount = rewards.awards.filter((award) => award.earned).length
  const filteredHistory = [...rewards.summaries]
    .reverse()
    .filter((session) => !selectedDay || session.localDay === selectedDay)
  const filteredRecords = rewards.records.filter(
    (record) => recordFilter === 'all' || record.exerciseId === recordFilter,
  )
  const recordExercises = [...new Set(rewards.records.map((record) => record.exerciseId))].sort(
    (a, b) => byId[a].name.localeCompare(byId[b].name),
  )
  const firstWeekDay = weekDays(now)[0]
  const activity = Array.from({ length: 8 }, (_, index) => {
    const date = new Date(firstWeekDay)
    date.setDate(date.getDate() - (7 - index) * 7)
    const key = localDay(date)
    return { key, count: rewards.weeklyHistory.find((week) => week.key === key)?.count || 0 }
  })
  const maxActivity = Math.max(1, ...activity.map((week) => week.count))
  const selectedCount = rewards.currentWeek.days.find((day) => day.date === selectedDay)?.count || 0

  return (
    <div className="view-journey">
      <div className="page-heading">
        <div>
          <p className="eyebrow">LOOK HOW FAR YOU’VE COME</p>
          <h1>
            Your effort has a story<span className="greeting-dot">.</span>
          </h1>
          <p>
            {rewards.sessions
              ? 'Small wins, adding up to something big.'
              : 'Start where you are. Your first chapter is waiting.'}
          </p>
        </div>
        <Pill>
          <Sparkles size={14} aria-hidden="true" /> Keep becoming
        </Pill>
      </div>

      <div className="journey-hero panel">
        <div className="journey-profile">
          <div className="journey-avatar">
            <SparkBuddy small />
          </div>
          <div>
            <span className="eyebrow">FITT ATHLETE</span>
            <h2>{preferences.displayName.trim() || 'You'}</h2>
            <p>{rewards.sessions ? 'Building momentum' : 'Your next chapter starts here'}</p>
          </div>
        </div>
        <XPCard xp={rewards.xp} />
        <div className="journey-stats">
          <span>
            <Dumbbell size={20} aria-hidden="true" />
            <strong>{rewards.sessions.toLocaleString()}</strong>
            <small>workouts</small>
          </span>
          <span>
            <Award size={20} aria-hidden="true" />
            <strong>{earnedCount}</strong>
            <small>awards earned</small>
          </span>
          <span>
            <Flame size={20} aria-hidden="true" />
            <strong>{rewards.weeksTrained.toLocaleString()}</strong>
            <small>weeks showing up</small>
          </span>
        </div>
      </div>

      <div className="journey-two">
        <section className="panel consistency-panel">
          <SectionTitle title="Your kind of consistent" action={<Pill>This week</Pill>} />
          <Week
            days={rewards.currentWeek.days.map((day) => calendarDate(day.date))}
            completedDays={rewards.currentWeek.days
              .filter((day) => day.done)
              .map((day) => day.date)}
            selected={selectedDay || undefined}
            today={now}
            onSelect={(key) => {
              setSelectedDay((selected) => (selected === key ? null : key))
              setHistoryLimit(6)
            }}
          />
          <div className="journey-week-summary" aria-live="polite">
            <strong>
              {selectedDay
                ? `${shortDate(selectedDay)} · ${selectedCount} ${selectedCount === 1 ? 'workout' : 'workouts'}`
                : `${rewards.currentWeek.count} of ${rewards.currentWeek.goal} workouts this week`}
            </strong>
            <span>
              {selectedDay
                ? selectedCount
                  ? 'Your saved workouts are shown below.'
                  : 'No workout logged. Recovery belongs here too.'
                : rewards.currentWeek.goalReached
                  ? 'Goal reached. Make room for recovery.'
                  : 'One manageable step at a time.'}
            </span>
          </div>
          {rewards.currentWeek.goalLocked && rewards.currentWeek.goal !== profile.weeklyGoal && (
            <p className="quiet-copy">
              Your new goal of {profile.weeklyGoal} starts next week. This week stays at{' '}
              {rewards.currentWeek.goal}.
            </p>
          )}
          <p className="quiet-copy">
            <Leaf size={15} aria-hidden="true" /> Rest days keep your earned XP and awards.
          </p>
        </section>
        <section className="panel personal-best">
          <span className="record-icon">
            <TrendingUp size={24} aria-hidden="true" />
          </span>
          {latestRecord ? (
            <div>
              <p className="eyebrow">BEST LOGGED SET · {byId[latestRecord.exerciseId].name}</p>
              <h3>
                {latestRecord.value.toLocaleString()}
                <small> {latestRecord.unit === 'sec' ? 'seconds' : 'reps'}</small>
              </h3>
              <p>
                {latestRecord.load ? `+${latestRecord.load} kg added load` : 'No added load'}
                {' · '}
                {new Date(latestRecord.achievedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
          ) : (
            <div>
              <p className="eyebrow">A STARTING POINT, NOT A FINISH LINE</p>
              <h3 className="journey-empty-record-title">Your first baseline.</h3>
              <p>Log a workout to discover what you can build on.</p>
              <Button variant="ghost" onClick={onTrain} className="journey-empty-record-action">
                Find your next workout <ArrowRight size={15} aria-hidden="true" />
              </Button>
            </div>
          )}
        </section>
      </div>

      <section className="journey-analytics panel">
        <SectionTitle
          eyebrow="EFFORT YOU CAN SEE"
          title="A little more, over time"
          action={<Pill>Last 8 weeks</Pill>}
        />
        <div className="journey-analytics-layout">
          <figure className="journey-activity">
            <figcaption>Workouts saved each week</figcaption>
            <ol className="journey-bars" aria-label="Weekly workout counts">
              {activity.map((week, index) => (
                <li key={week.key} className={index === 7 ? 'current' : ''}>
                  <span className="sr-only">
                    Week of {shortDate(week.key)}: {week.count}{' '}
                    {week.count === 1 ? 'workout' : 'workouts'}.
                  </span>
                  <div className="journey-bar-track" aria-hidden="true">
                    <div
                      className="journey-bar-fill"
                      style={{ height: `${(week.count / maxActivity) * 100}%` }}
                    >
                      <strong>{week.count}</strong>
                    </div>
                  </div>
                  <span className="journey-bar-date" aria-hidden="true">
                    {shortDate(week.key)}
                  </span>
                </li>
              ))}
            </ol>
          </figure>
          <dl className="journey-totals">
            <div>
              <dt>
                <Check size={16} aria-hidden="true" /> Sets logged
              </dt>
              <dd>{rewards.completedSets.toLocaleString()}</dd>
            </div>
            <div>
              <dt>
                <Clock3 size={16} aria-hidden="true" /> Session time
              </dt>
              <dd>{timeLabel(rewards.elapsedSeconds)}</dd>
            </div>
            <div>
              <dt>
                <Dumbbell size={16} aria-hidden="true" /> Reps completed
              </dt>
              <dd>{rewards.totalReps.toLocaleString()}</dd>
            </div>
            <div>
              <dt>
                <Clock3 size={16} aria-hidden="true" /> Timed holds
              </dt>
              <dd>{timeLabel(rewards.totalHoldSeconds)}</dd>
            </div>
          </dl>
        </div>
        {!rewards.sessions && (
          <p className="quiet-copy">Your chart will grow with your saved workouts. No rush.</p>
        )}
      </section>

      <SectionTitle
        eyebrow="MILESTONES THAT MEAN SOMETHING"
        title="Your collection"
        action={<span className="muted">Earned. Always yours.</span>}
      />
      <div className="award-grid">
        {rewards.awards.map((award, index) => {
          const Icon = awardIcons[award.id]
          return (
            <button
              type="button"
              key={award.id}
              className={`award-tile panel ${award.earned ? 'unlocked' : 'locked'}`}
              onClick={() => onAward(award.id)}
              aria-label={`${award.title}, ${award.earned ? 'earned' : 'not yet earned'}. ${award.description}`}
            >
              <div className="award-tile-top">
                <span>{String(index + 1).padStart(2, '0')}</span>
                {award.earned ? (
                  <Check size={15} aria-hidden="true" />
                ) : (
                  <LockKeyhole size={13} aria-hidden="true" />
                )}
              </div>
              <div className="award-seal">
                <Icon size={28} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <h3>{award.title}</h3>
              <p>{award.description}</p>
              {!award.earned && (
                <ProgressBar
                  value={(award.progress / award.target) * 100}
                  label={`${award.title} progress`}
                />
              )}
              <small>
                {award.earned && <Check size={11} aria-hidden="true" />} {award.detail}
              </small>
            </button>
          )
        })}
      </div>

      {rewards.records.length > 0 && (
        <section className="journey-records panel">
          <SectionTitle
            eyebrow="A BASELINE TO BUILD ON"
            title="Your best logged sets"
            action={
              <label className="journey-record-filter">
                <span className="sr-only">Filter records by exercise</span>
                <Select
                  label="Filter records by exercise"
                  value={recordFilter}
                  onValueChange={(value) => {
                    setRecordFilter(value)
                    setRecordLimit(6)
                  }}
                  options={[
                    { value: 'all', label: 'All exercises' },
                    ...recordExercises.map((value) => ({ value, label: byId[value].name })),
                  ]}
                />
              </label>
            }
          />
          <p className="journey-section-note">
            Each exercise and added load has its own baseline. Holds stay in seconds.
          </p>
          <ul className="journey-record-list">
            {filteredRecords.slice(0, recordLimit).map((record) => (
              <li key={record.key}>
                <span className="journey-record-icon">
                  <TrendingUp size={18} aria-hidden="true" />
                </span>
                <div>
                  <strong>{byId[record.exerciseId].name}</strong>
                  <small>{record.load ? `+${record.load} kg added load` : 'No added load'}</small>
                </div>
                <span className="journey-record-value">
                  <strong>{record.value.toLocaleString()}</strong>
                  <small>{record.unit === 'sec' ? 'seconds' : 'reps'}</small>
                </span>
              </li>
            ))}
          </ul>
          {filteredRecords.length > recordLimit && (
            <Button
              variant="ghost"
              className="journey-show-more"
              onClick={() => setRecordLimit((count) => count + 12)}
            >
              Show more records <ChevronRight size={15} aria-hidden="true" />
            </Button>
          )}
        </section>
      )}

      <section className="journey-journal panel">
        <SectionTitle
          eyebrow="EVERY TIME YOU SHOWED UP"
          title="Your workout journal"
          action={
            selectedDay ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedDay(null)
                  setHistoryLimit(6)
                }}
              >
                Clear day filter <X size={14} aria-hidden="true" />
              </Button>
            ) : (
              <Pill>{rewards.sessions} saved</Pill>
            )
          }
        />
        {filteredHistory.length ? (
          <ul className="journey-journal-list">
            {filteredHistory.slice(0, historyLimit).map((summary) => {
              const session = sessionsById.get(summary.sessionId)
              if (!session) return null
              return (
                <li key={summary.sessionId}>
                  <button type="button" onClick={() => onSession(session)}>
                    <span className="journey-journal-icon">
                      <CalendarDays size={20} aria-hidden="true" />
                    </span>
                    <span className="journey-journal-copy">
                      <strong>{session.title}</strong>
                      <small>
                        {calendarDate(summary.localDay).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                        {' · '}
                        {summary.completedSets} {summary.completedSets === 1 ? 'set' : 'sets'}
                        {' · '}
                        {timeLabel(summary.elapsedSeconds)}
                      </small>
                    </span>
                    <span className="journey-journal-xp">+{summary.xp} XP</span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="journey-journal-empty">
            <CalendarDays size={26} aria-hidden="true" />
            <h3>
              {selectedDay ? 'A little space in your week.' : 'Your story starts with one workout.'}
            </h3>
            <p>
              {selectedDay
                ? 'No workouts saved for this day. Rest is part of getting stronger.'
                : 'Log what you can today. Your saved sessions will appear here.'}
            </p>
            {!selectedDay && (
              <Button onClick={onTrain}>
                Find your next workout <ArrowRight size={16} aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
        {filteredHistory.length > historyLimit && (
          <Button
            variant="ghost"
            className="journey-show-more"
            onClick={() => setHistoryLimit((count) => count + 12)}
          >
            Show more workouts <ChevronRight size={15} aria-hidden="true" />
          </Button>
        )}
      </section>

      <div className="journey-bottom">
        <SparkBuddy small />
        <p>
          <strong>You don’t have to be motivated every day.</strong> Just make the next step small
          enough to take.
        </p>
        <Button variant="secondary" onClick={onTrain}>
          Find your next workout <ArrowRight size={15} aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
