import { useState } from 'react'
import { ArrowUpRight, BookOpen, Check, Search, SlidersHorizontal, X } from 'lucide-react'
import { available, equipmentList, exercises, muscleNames } from '../lib/catalog'
import type { Muscle, Profile } from '../lib/types'
import { ExerciseThumbnail } from './ExerciseGuide'
import { Select } from './ui'
import './library.css'

export interface LibraryViewProps {
  profile: Profile
  onInfo: (exerciseId: string) => void
}

export default function LibraryView({ profile, onInfo }: LibraryViewProps) {
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const query = search.trim().toLocaleLowerCase()
  const filtered = exercises.filter(
    (exercise) =>
      (!query ||
        `${exercise.name} ${exercise.muscles.map((id) => muscleNames[id]).join(' ')} ${exercise.pattern}`
          .toLocaleLowerCase()
          .includes(query)) &&
      (muscle === 'all' || exercise.muscles.includes(muscle)) &&
      (!onlyAvailable || available(exercise, profile.equipment)),
  )
  const clear = () => {
    setSearch('')
    setMuscle('all')
    setOnlyAvailable(false)
  }
  return (
    <div className="library-view">
      <div className="page-heading">
        <div>
          <p className="eyebrow">KNOW YOUR MOVEMENT</p>
          <h1>
            Good form starts here<span className="greeting-dot">.</span>
          </h1>
          <p>A little understanding makes every rep better.</p>
        </div>
        <span className="library-heading-icon" aria-hidden="true">
          <BookOpen size={26} />
        </span>
      </div>
      <div className="library-controls panel">
        <label className="library-search">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a movement…"
            aria-label="Search exercises"
          />
          {search && (
            <button type="button" aria-label="Clear exercise search" onClick={() => setSearch('')}>
              <X size={16} />
            </button>
          )}
        </label>
        <label className="library-muscle-filter">
          <SlidersHorizontal size={16} />
          <Select
            label="Filter muscle group"
            value={muscle}
            onValueChange={(value) => setMuscle(value as Muscle | 'all')}
            options={[
              { value: 'all', label: 'All muscle groups' },
              ...Object.entries(muscleNames).map(([value, label]) => ({ value, label })),
            ]}
          />
        </label>
        <button
          className={`library-available-toggle ${onlyAvailable ? 'is-selected' : ''}`}
          type="button"
          aria-pressed={onlyAvailable}
          onClick={() => setOnlyAvailable((value) => !value)}
        >
          <span className="library-toggle-check">{onlyAvailable && <Check size={12} />}</span>My
          equipment only
        </button>
      </div>
      <div className="library-results">
        <p role="status">
          {filtered.length} {filtered.length === 1 ? 'movement' : 'movements'}
          {onlyAvailable ? ' for your equipment' : ' to explore'}
        </p>
        {(search || muscle !== 'all' || onlyAvailable) && (
          <button type="button" onClick={clear}>
            Clear filters
            <X size={13} />
          </button>
        )}
      </div>
      <div className="library-cards">
        {filtered.map((exercise) => {
          const ready = available(exercise, profile.equipment)
          const missing = exercise.equipment
            .filter((id) => !profile.equipment.includes(id))
            .map((id) => equipmentList.find((item) => item.id === id)!.name)
          return (
            <button
              type="button"
              key={exercise.id}
              className="library-exercise panel"
              aria-label={`View ${exercise.name} instructions`}
              onClick={() => onInfo(exercise.id)}
            >
              <div className="library-exercise-art">
                <ExerciseThumbnail exerciseId={exercise.id} />
                <span className="library-art-action">
                  <ArrowUpRight size={18} />
                </span>
              </div>
              <div className="library-exercise-copy">
                <span className="library-level">
                  {exercise.level <= 1
                    ? 'FOUNDATION'
                    : exercise.level === 2
                      ? 'INTERMEDIATE'
                      : 'PROGRESSION'}
                </span>
                <h2>{exercise.name}</h2>
                <p>{exercise.muscles.map((id) => muscleNames[id]).join(' · ')}</p>
                <span className={`library-equipment-note ${ready ? 'is-ready' : ''}`}>
                  {ready ? (
                    <>
                      <Check size={13} />
                      Ready with your equipment
                    </>
                  ) : (
                    <>Needs {missing.join(' + ').toLowerCase()}</>
                  )}
                </span>
              </div>
            </button>
          )
        })}
      </div>
      {!filtered.length && (
        <div className="library-empty panel">
          <span>
            <Search size={28} />
          </span>
          <h2>No movements found.</h2>
          <p>
            Try another name or muscle group, or include exercises beyond your current equipment.
          </p>
          <button type="button" className="secondary-button" onClick={clear}>
            Clear filters
          </button>
        </div>
      )}
      <p className="library-bottom-note">
        Open a movement for the existing animated guide, form cues, and muscles worked. Choose a
        variation you can control.
      </p>
    </div>
  )
}
