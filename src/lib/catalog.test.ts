import { describe, expect, it } from 'vitest'
import { byId, equipmentList, exercises, muscleNames } from './catalog'
import { defaultProfile, generateWorkout } from './workout'

describe('specific muscle groups', () => {
  it('distinguishes pressing, pulling, and straight-arm grip work', () => {
    expect(byId['knee-pushup'].muscles).toContain('triceps')
    expect(byId['knee-pushup'].muscles).not.toContain('biceps')
    expect(byId.pullup.muscles).toEqual(
      expect.arrayContaining(['upper-back', 'biceps', 'forearms']),
    )
    expect(byId.pullup.muscles).not.toContain('triceps')
    expect(byId['scapular-pullup'].muscles).toContain('forearms')
    expect(byId['scapular-pullup'].muscles).not.toContain('biceps')
  })

  it('includes standing leg stabilizers without assigning them to floor exercises', () => {
    for (const id of ['squat', 'reverse-lunge', 'split-squat']) {
      expect(byId[id].muscles).toEqual(expect.arrayContaining(['calves', 'lower-back']))
    }
    for (const id of ['knee-pushup', 'deadbug', 'glute-bridge']) {
      expect(byId[id].muscles).not.toContain('calves')
      expect(byId[id].muscles).not.toContain('lower-back')
    }
  })

  it('keeps pull-up equipment and grip work connected to generated plans', () => {
    expect(equipmentList.filter((item) => item.id === 'bar')).toHaveLength(1)
    const bodyweight = generateWorkout(defaultProfile, [])
    const bodyweightMuscles = bodyweight.exercises.flatMap(
      (entry) => byId[entry.exerciseId].muscles,
    )
    expect(bodyweightMuscles).not.toContain('forearms')
    const withBar = generateWorkout({ ...defaultProfile, equipment: ['bar'] }, [])
    expect(withBar.exercises.map((entry) => entry.exerciseId)).toContain('scapular-pullup')
    expect(withBar.exercises.flatMap((entry) => byId[entry.exerciseId].muscles)).toContain(
      'forearms',
    )
  })

  it('keeps catalogue groups named and unambiguous for filters and plan summaries', () => {
    for (const exercise of exercises) {
      expect(new Set(exercise.muscles).size).toBe(exercise.muscles.length)
      for (const muscle of exercise.muscles) expect(muscleNames[muscle]).toBeTruthy()
    }
    expect(muscleNames).toMatchObject({
      'upper-back': 'Upper back',
      'lower-back': 'Lower back',
      biceps: 'Biceps',
      triceps: 'Triceps',
      forearms: 'Forearms',
      calves: 'Calves',
    })
  })
})
