import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { muscleNames } from '../lib/catalog'
import type { Muscle } from '../lib/types'
import { MuscleMap } from './Visuals'

function regions(muscles: Muscle[]) {
  const markup = renderToStaticMarkup(createElement(MuscleMap, { muscles }))
  return (markup.match(/<path\b[^>]*>/g) ?? []).flatMap((path) => {
    const muscle = path.match(/data-muscle="([^"]+)"/)?.[1]
    if (!muscle) return []
    return [
      {
        muscle,
        active: path.includes('data-active="true"'),
        fill: path.match(/fill="([^"]+)"/)?.[1],
      },
    ]
  })
}

describe('anatomical muscle map', () => {
  it('can highlight forearms, calves, lower back, and triceps independently', () => {
    const selected: Muscle[] = ['forearms', 'calves', 'lower-back', 'triceps']
    const paths = regions(selected)
    expect(new Set(paths.filter((path) => path.active).map((path) => path.muscle))).toEqual(
      new Set(selected),
    )
    for (const path of paths) {
      expect(path.fill).toMatch(path.active ? /-active\)$/ : /-rest\)$/)
    }
    expect(paths.filter((path) => ['biceps', 'upper-back'].includes(path.muscle))).not.toHaveLength(
      0,
    )
    expect(
      paths
        .filter((path) => ['biceps', 'upper-back'].includes(path.muscle))
        .every((path) => !path.active),
    ).toBe(true)
  })

  it('has a visible anatomical region for every group offered in the library', () => {
    const muscles = Object.keys(muscleNames) as Muscle[]
    const paths = regions(muscles)
    expect(new Set(paths.map((path) => path.muscle))).toEqual(new Set(muscles))
    expect(paths.every((path) => path.active && path.fill?.endsWith('-active)'))).toBe(true)
  })
})
