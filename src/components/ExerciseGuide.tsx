import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import type { Exercise } from '../lib/types'
import { AthleteFigure, type AthletePose, type Point } from './ExerciseArtwork'

type Pose = AthletePose
type Demo = {
  start: Pose
  end: Pose
  view: 'SIDE VIEW' | 'FRONT VIEW' | 'TOP VIEW'
  action: string
  reset: string
  equipment?: 'wall' | 'bench' | 'bar' | 'rings' | 'low-rings' | 'parallettes' | 'band' | 'assist'
  hold?: boolean
}
const p = (
  head: Point,
  shoulder: Point,
  elbow: Point,
  hand: Point,
  hip: Point,
  knee: Point,
  foot: Point,
  extra: Partial<Pose> = {},
): Pose => ({ head, shoulder, elbow, hand, hip, knee, foot, ...extra })
// The reference poses share consistent adult proportions. The renderer preserves
// limb lengths between keyframes rather than shrinking a forearm as an elbow bends.
const pushStart = p(
  [133, 133],
  [154, 143],
  [150, 175],
  [146, 208],
  [206, 169],
  [247, 189],
  [285, 208],
)
const pushEnd = p(
  [118, 179],
  [141, 183],
  [174, 191],
  [146, 208],
  [198, 193],
  [242, 200],
  [285, 208],
)
const hang = p([200, 68], [200, 92], [162, 67], [140, 42], [200, 145], [187, 185], [181, 225], {
  elbow2: [238, 67],
  hand2: [260, 42],
  knee2: [213, 185],
  foot2: [219, 225],
})
const pull = p([200, 26], [200, 50], [160, 77], [140, 42], [200, 103], [187, 143], [181, 183], {
  elbow2: [240, 77],
  hand2: [260, 42],
  knee2: [213, 143],
  foot2: [219, 183],
})
const supine = p([102, 203], [125, 203], [158, 206], [190, 208], [183, 203], [217, 180], [255, 211])
const bridge = p([102, 203], [125, 203], [158, 206], [190, 208], [172, 170], [217, 174], [255, 211])
const standing = p(
  [193, 51],
  [193, 75],
  [208, 105],
  [223, 134],
  [193, 133],
  [198, 176],
  [196, 218],
  {
    knee2: [182, 176],
    foot2: [177, 218],
  },
)
const shifted = (pose: Pose, x: number, y = 0) =>
  Object.fromEntries(
    Object.entries(pose).map(([key, value]) => [key, [value[0] + x, value[1] + y]]),
  ) as unknown as Pose

export const demos: Record<string, Demo> = {
  'wall-pushup': {
    start: p([244, 58], [238, 81], [270, 88], [301, 95], [223, 137], [211, 180], [200, 220]),
    end: p([284, 71], [273, 91], [274, 123], [301, 95], [244, 142], [222, 182], [200, 220]),
    view: 'SIDE VIEW',
    action: 'Bend elbows · body stays straight',
    reset: 'Press away from the wall',
    equipment: 'wall',
  },
  'knee-pushup': {
    start: p([150, 128], [170, 141], [174, 175], [178, 208], [214, 179], [248, 208], [284, 185]),
    end: p([125, 176], [148, 182], [180, 175], [178, 208], [204, 197], [248, 208], [284, 185]),
    view: 'SIDE VIEW',
    action: 'Lower chest · keep hips in line',
    reset: 'Press through your hands',
  },
  'incline-pushup': {
    start: p([178, 69], [190, 89], [169, 116], [148, 143], [221, 138], [245, 177], [267, 213]),
    end: p([143, 97], [160, 113], [181, 133], [148, 143], [203, 153], [236, 184], [267, 213]),
    view: 'SIDE VIEW',
    action: 'Lower toward the stable surface',
    reset: 'Press away · brace your core',
    equipment: 'bench',
  },
  pushup: {
    start: pushStart,
    end: pushEnd,
    view: 'SIDE VIEW',
    action: 'Lower chest · elbows angled back',
    reset: 'Press up as one straight line',
  },
  'diamond-pushup': {
    start: { ...pushStart, hand: [154, 208] },
    end: { ...pushEnd, elbow: [174, 183], hand: [154, 208] },
    view: 'SIDE VIEW',
    action: 'Hands close · elbows stay tucked',
    reset: 'Press through your palms',
  },
  'ring-pushup': {
    start: p([169, 100], [187, 115], [181, 147], [175, 179], [232, 152], [267, 180], [300, 208]),
    end: p([139, 157], [161, 164], [192, 149], [175, 179], [216, 181], [260, 195], [300, 208]),
    view: 'SIDE VIEW',
    action: 'Lower slowly between the rings',
    reset: 'Press up · keep rings steady',
    equipment: 'low-rings',
  },
  'prone-pulldown': {
    start: p([200, 58], [200, 82], [160, 55], [145, 25], [200, 137], [187, 178], [183, 218], {
      elbow2: [240, 55],
      hand2: [255, 25],
      knee2: [213, 178],
      foot2: [217, 218],
    }),
    end: p([200, 58], [200, 82], [159, 109], [147, 79], [200, 137], [187, 178], [183, 218], {
      elbow2: [241, 109],
      hand2: [253, 79],
      knee2: [213, 178],
      foot2: [217, 218],
    }),
    view: 'TOP VIEW',
    action: 'Pull elbows toward your ribs',
    reset: 'Reach overhead · keep neck neutral',
  },
  'reverse-snow-angel': {
    start: p([200, 58], [200, 82], [175, 113], [173, 147], [200, 137], [187, 178], [183, 218], {
      elbow2: [225, 113],
      hand2: [227, 147],
      knee2: [213, 178],
      foot2: [217, 218],
    }),
    end: p([200, 58], [200, 82], [161, 55], [151, 23], [200, 137], [187, 178], [183, 218], {
      elbow2: [239, 55],
      hand2: [249, 23],
      knee2: [213, 178],
      foot2: [217, 218],
    }),
    view: 'TOP VIEW',
    action: 'Sweep arms overhead · lift slightly',
    reset: 'Return slowly toward your hips',
  },
  'band-row': {
    start: p([149, 123], [151, 147], [183, 158], [214, 170], [156, 205], [201, 208], [244, 211]),
    end: p([149, 123], [151, 147], [137, 177], [168, 192], [156, 205], [201, 208], [244, 211]),
    view: 'SIDE VIEW',
    action: 'Pull toward your ribs · sit tall',
    reset: 'Release slowly · no rounding',
    equipment: 'band',
  },
  'ring-row': {
    start: p([162, 109], [181, 123], [196, 93], [211, 65], [228, 157], [265, 183], [300, 208]),
    end: p([193, 76], [207, 95], [238, 83], [211, 65], [244, 140], [272, 175], [300, 208]),
    view: 'SIDE VIEW',
    action: 'Pull your chest toward the rings',
    reset: 'Lower as one line · keep heels down',
    equipment: 'rings',
  },
  'low-ring-row': {
    start: p([135, 169], [158, 174], [170, 142], [180, 110], [214, 188], [258, 198], [300, 208]),
    end: p([162, 109], [181, 123], [214, 113], [180, 110], [228, 157], [265, 183], [300, 208]),
    view: 'SIDE VIEW',
    action: 'Pull to rings · keep your body straight',
    reset: 'Lower with control',
    equipment: 'rings',
  },
  'scapular-pullup': {
    start: hang,
    end: {
      ...hang,
      head: [200, 61],
      hip: [200, 138],
      knee: [187, 178],
      foot: [181, 218],
      knee2: [213, 178],
      foot2: [219, 218],
    },
    view: 'FRONT VIEW',
    action: 'Draw shoulders down · arms stay straight',
    reset: 'Relax slowly into your hang',
    equipment: 'bar',
  },
  'negative-pullup': {
    start: pull,
    end: hang,
    view: 'FRONT VIEW',
    action: 'Lower for 3–5 seconds',
    reset: 'Use your bench to reset at the top',
    equipment: 'bar',
  },
  'assisted-pullup': {
    start: hang,
    end: pull,
    view: 'FRONT VIEW',
    action: 'Pull elbows down · avoid swinging',
    reset: 'Lower slowly with band assistance',
    equipment: 'assist',
  },
  pullup: {
    start: hang,
    end: pull,
    view: 'FRONT VIEW',
    action: 'Pull until your chin clears the bar',
    reset: 'Lower slowly to straight arms',
    equipment: 'bar',
  },
  squat: {
    start: standing,
    end: p([191, 95], [185, 118], [218, 124], [249, 130], [171, 174], [217, 178], [196, 218], {
      knee2: [200, 181],
      foot2: [177, 218],
    }),
    view: 'SIDE VIEW',
    action: 'Sit down and back · keep heels planted',
    reset: 'Drive through the floor to stand',
  },
  'reverse-lunge': {
    start: shifted(standing, 35),
    end: p([210, 94], [208, 117], [220, 147], [225, 182], [202, 175], [244, 175], [231, 218], {
      knee2: [168, 209],
      foot2: [127, 218],
    }),
    view: 'SIDE VIEW',
    action: 'Step back · lower with control',
    reset: 'Push through the front foot · switch sides',
  },
  'split-squat': {
    start: p([208, 64], [208, 87], [216, 120], [225, 152], [208, 145], [237, 181], [260, 218], {
      knee2: [174, 173],
      foot2: [126, 143],
    }),
    end: p([210, 94], [210, 117], [218, 150], [227, 182], [210, 175], [250, 177], [260, 218], {
      knee2: [169, 202],
      foot2: [126, 143],
    }),
    view: 'SIDE VIEW',
    action: 'Lower back knee · front heel stays down',
    reset: 'Drive through the front foot · reps per leg',
    equipment: 'bench',
  },
  'glute-bridge': {
    start: supine,
    end: bridge,
    view: 'SIDE VIEW',
    action: 'Lift hips · squeeze your glutes',
    reset: 'Lower slowly · avoid arching your back',
  },
  'single-leg-bridge': {
    start: { ...supine, knee2: [217, 181], foot2: [237, 145] },
    end: { ...bridge, knee2: [208, 145], foot2: [238, 116] },
    view: 'SIDE VIEW',
    action: 'Lift hips · keep your pelvis level',
    reset: 'Lower slowly · repeat on both sides',
  },
  deadbug: {
    start: p([103, 201], [126, 201], [127, 168], [129, 135], [184, 203], [190, 158], [233, 161], {
      elbow2: [121, 169],
      hand2: [118, 135],
      knee2: [179, 158],
      foot2: [222, 157],
    }),
    end: p([103, 201], [126, 201], [94, 192], [62, 183], [184, 203], [190, 158], [233, 161], {
      elbow2: [121, 169],
      hand2: [118, 135],
      knee2: [225, 201],
      foot2: [268, 203],
    }),
    view: 'SIDE VIEW',
    action: 'Extend opposite arm and leg · brace',
    reset: 'Return and alternate · reps per side',
  },
  plank: {
    start: p([131, 170], [153, 175], [151, 208], [118, 208], [210, 188], [254, 198], [295, 208]),
    end: p([131, 169], [153, 174], [151, 208], [118, 208], [210, 187], [254, 197], [295, 208]),
    view: 'SIDE VIEW',
    action: 'Brace core and glutes · breathe steadily',
    reset: 'Keep a straight line from head to heels',
    hold: true,
  },
  'hollow-hold': {
    start: p([113, 167], [132, 180], [108, 157], [84, 135], [184, 207], [224, 188], [263, 169]),
    end: p([113, 166], [132, 179], [108, 156], [84, 134], [184, 207], [224, 187], [263, 168]),
    view: 'SIDE VIEW',
    action: 'Keep your lower back on the floor',
    reset: 'Breathe · bend knees to make it easier',
    hold: true,
  },
  'tuck-support': {
    start: p([175, 84], [175, 108], [178, 141], [180, 175], [175, 166], [217, 151], [211, 193]),
    end: p([175, 82], [175, 106], [178, 141], [180, 175], [175, 164], [217, 149], [211, 191]),
    view: 'SIDE VIEW',
    action: 'Press bars down · shoulders away from ears',
    reset: 'Hold knees tucked · keep breathing',
    equipment: 'parallettes',
    hold: true,
  },
  'wall-slide': {
    start: p([200, 57], [200, 81], [155, 104], [153, 72], [200, 136], [185, 177], [181, 218], {
      elbow2: [245, 104],
      hand2: [247, 72],
      knee2: [215, 177],
      foot2: [219, 218],
    }),
    end: p([200, 57], [200, 81], [167, 49], [179, 18], [200, 136], [185, 177], [181, 218], {
      elbow2: [233, 49],
      hand2: [221, 18],
      knee2: [215, 177],
      foot2: [219, 218],
    }),
    view: 'FRONT VIEW',
    action: 'Slide arms up · keep ribs down',
    reset: 'Lower within a comfortable range',
  },
  'pike-pushup': {
    start: p([183, 162], [203, 151], [190, 180], [176, 208], [254, 123], [271, 165], [280, 208]),
    end: p([170, 181], [188, 167], [209, 194], [176, 208], [235, 133], [258, 172], [280, 208]),
    view: 'SIDE VIEW',
    action: 'Lower head ahead of hands · hips high',
    reset: 'Press through your shoulders',
  },
}

function interpolate(a: Pose, b: Pose, t: number, exerciseId?: string): Pose {
  const pose = Object.fromEntries(
    Object.keys(a).map((key) => {
      const x = a[key as keyof Pose]!,
        y = b[key as keyof Pose] || x
      return [key, [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t]]
    }),
  ) as unknown as Pose
  if (exerciseId === 'reverse-snow-angel') {
    // Sweep around the shoulders; a straight-line tween would cut through the torso.
    const angle = ((100 + 141 * t) * Math.PI) / 180
    pose.hand = [184 + Math.cos(angle) * 66, 82 + Math.sin(angle) * 66]
    pose.hand2 = [400 - pose.hand[0], pose.hand[1]]
    pose.elbow = [184 + Math.cos(angle) * 34, 82 + Math.sin(angle) * 34]
    pose.elbow2 = [400 - pose.elbow[0], pose.elbow[1]]
  }
  return pose
}
const proneExercises = new Set([
  'pushup',
  'knee-pushup',
  'incline-pushup',
  'diamond-pushup',
  'ring-pushup',
  'plank',
  'pike-pushup',
])

const standingExercises = new Set([
  'wall-pushup',
  'squat',
  'reverse-lunge',
  'split-squat',
  'wall-slide',
])
function groundHeight(exerciseId: string) {
  return ['pullup', 'negative-pullup', 'assisted-pullup', 'scapular-pullup'].includes(exerciseId)
    ? 241
    : standingExercises.has(exerciseId)
      ? 228
      : 219
}

function sceneFrame(demo: Demo, exerciseId: string, compact = false) {
  const points = (
    compact ? Object.values(demo.start) : [...Object.values(demo.start), ...Object.values(demo.end)]
  ) as Point[]
  let left = Math.min(...points.map(([x]) => x)) - 24
  let right = Math.max(...points.map(([x]) => x)) + 28
  // Allow room for a fully folded elbow to extend above its endpoint keyframes.
  let top = Math.min(...points.map(([, y]) => y)) - (compact ? 24 : 36)
  let bottom = Math.max(...points.map(([, y]) => y)) + 20
  if (compact)
    return { left, top: Math.max(0, top), width: right - left, height: bottom - Math.max(0, top) }
  if (demo.view !== 'SIDE VIEW') return { left: 0, top: 0, width: 400, height: 250 }
  bottom = Math.max(bottom, groundHeight(exerciseId) + 20)
  if (demo.equipment === 'bench') left = Math.min(left, 60)
  if (demo.equipment === 'wall') {
    right = 345
    top = 0
  }
  const width = Math.min(400, Math.max(right - left, (bottom - top) * 1.6))
  const height = width / 1.6
  return {
    left: Math.max(0, Math.min(400 - width, (left + right - width) / 2)),
    top: Math.max(0, (top + bottom - height) / 2),
    width,
    height,
  }
}

function ExerciseScene({
  demo,
  pose,
  exerciseId,
  compact = false,
  breath = 0,
  resetting = false,
}: {
  demo: Demo
  pose: Pose
  exerciseId: string
  compact?: boolean
  breath?: number
  resetting?: boolean
}) {
  const id = useId().replace(/:/g, '')
  const negative = exerciseId === 'negative-pullup'
  const equipment = demo.equipment
  const ringY = demo.start.hand[1]
  const ringX = demo.start.hand[0]
  const ground = groundHeight(exerciseId)
  const frame = sceneFrame(demo, exerciseId)
  return (
    <>
      <defs>
        <linearGradient id={`${id}-studio`} x1="0" y1="0" x2=".5" y2="1">
          <stop stopColor="#fafbf6" />
          <stop offset="1" stopColor="#edf1e8" />
        </linearGradient>
        <radialGradient id={`${id}-shadow`}>
          <stop stopColor="#55694e" stopOpacity=".19" />
          <stop offset="1" stopColor="#55694e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-mat`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#d9e1cf" />
          <stop offset="1" stopColor="#c5d1b9" />
        </linearGradient>
      </defs>
      {!compact && (
        <>
          <rect x="-400" y="-250" width="1200" height="750" fill={`url(#${id}-studio)`} />
          {demo.view === 'TOP VIEW' ? (
            <>
              <rect
                x="103"
                y="9"
                width="194"
                height="230"
                rx="18"
                fill={`url(#${id}-mat)`}
                opacity=".42"
              />
              <rect
                x="110"
                y="16"
                width="180"
                height="216"
                rx="14"
                fill="none"
                stroke="#acb99f"
                strokeOpacity=".2"
              />
            </>
          ) : (
            <>
              <path
                d={`M-400 ${ground}Q200 ${ground - 14} 800 ${ground}V500H-400Z`}
                fill="#e7ede0"
                opacity=".55"
              />
              <ellipse cx="202" cy={ground + 3} rx="142" ry="14" fill={`url(#${id}-shadow)`} />
              <path d={`M29 ${ground}h342`} stroke="#c5d0ba" strokeWidth=".7" />
            </>
          )}
        </>
      )}
      {equipment === 'wall' && (
        <>
          <path d={`M311 15h20v${ground - 15}h-20Z`} fill="#dbe2d3" />
          <path d={`M311 15v${ground - 15}`} stroke="#afbea3" strokeWidth="2" />
          <path d="M313 15h18" stroke="#f8faf2" strokeWidth="3" />
        </>
      )}
      {equipment === 'bench' && (
        <g>
          <path
            d={`m82 153 8 ${ground - 155}h8l-2-${ground - 155}m47 0-2 ${ground - 155}h8l8-${ground - 155}`}
            fill="#7a8f72"
          />
          <path d={`M83 ${ground - 11}h70`} stroke="#879b7a" strokeWidth="3" />
          <rect x="74" y="143" width="91" height="14" rx="4" fill="#627958" />
          <rect x="74" y="143" width="91" height="5" rx="3" fill="#91a581" />
          <path d="M80 150h80" stroke="#aab99b" strokeOpacity=".45" />
          <path
            d={`M87 ${ground - 1}h15m35 0h15`}
            stroke="#53694b"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      )}
      {(equipment === 'bar' || equipment === 'assist') && (
        <>
          <path
            d="M117 34v8h166v-8"
            fill="none"
            stroke="#8a9c7d"
            strokeWidth="6"
            strokeLinejoin="round"
          />
          <path d="M120 40h160" stroke="#bcc8b1" strokeWidth="2" strokeLinecap="round" />
          <path d="M133 42h14m106 0h14" stroke="#516b50" strokeWidth="6" strokeLinecap="round" />
        </>
      )}
      {negative && (
        <g opacity={resetting ? 1 : 0.55}>
          <path
            d={`M288 165V${ground - 1}M330 165V${ground - 1}`}
            stroke="#91a180"
            strokeWidth="6"
          />
          <rect x="279" y="155" width="61" height="12" rx="4" fill="#80946d" />
          <path d="M283 157h53" stroke="#aabd91" strokeWidth="2" />
        </g>
      )}
      {(equipment === 'rings' || equipment === 'low-rings') && (
        <>
          {[
            { x: ringX - 13, y: ringY - 5, far: true },
            { x: ringX, y: ringY, far: false },
          ].map(({ x, y, far }) => (
            <g key={x} opacity={far ? 0.45 : 1}>
              <path d={`M${x} 0v${y - 12}`} stroke="#566c56" strokeWidth="3.4" />
              <path d={`M${x - 2} ${y - 34}h4v11h-4Z`} fill="#94a18a" />
              <ellipse
                cx={x}
                cy={y}
                rx="10"
                ry="14"
                stroke="#a78156"
                strokeWidth="4.5"
                fill="none"
              />
              <path
                d={`M${x - 7} ${y - 8}a8 11 0 0 1 11-2`}
                stroke="#dcc4a2"
                strokeWidth="1.2"
                fill="none"
              />
            </g>
          ))}
        </>
      )}
      {equipment === 'parallettes' && (
        <>
          <path
            d="M150 216v-46h42v46"
            stroke="#a8b69b"
            strokeWidth="5"
            fill="none"
            strokeLinejoin="round"
          />
          <path
            d="M163 218v-43h43v43"
            stroke="#718768"
            strokeWidth="5.5"
            fill="none"
            strokeLinejoin="round"
          />
          <path d="M161 175h47" stroke="#b5c59d" strokeWidth="5" strokeLinecap="round" />
          <path d="M155 218h16m27 0h16" stroke="#52694b" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {equipment === 'assist' && (
        <path
          d={`M200 42 178 ${pose.knee[1]}Q187 ${pose.knee[1] + 6} 196 ${pose.knee[1]}L200 42`}
          stroke="#b79a60"
          strokeWidth="3.6"
          strokeLinejoin="round"
          fill="none"
        />
      )}
      {equipment === 'band' && (
        <>
          <path
            d={`M${pose.hand.join(' ')} ${pose.foot[0] + 3} ${pose.foot[1] - 4} ${pose.foot[0] + 1} ${pose.foot[1] + 1} ${pose.hand[0] - 3} ${pose.hand[1] + 3}`}
            stroke="#b59a67"
            strokeWidth="2.7"
            fill="none"
          />
          <path
            d={`m${pose.foot[0]} ${pose.foot[1] - 8} 5 9`}
            stroke="#d4bf8a"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      )}
      <AthleteFigure
        pose={pose}
        view={demo.view}
        facing={proneExercises.has(exerciseId) ? -1 : 1}
        compact={compact}
        toesOnFloor={proneExercises.has(exerciseId) && exerciseId !== 'knee-pushup'}
      />
      {demo.hold && !compact && (
        <g transform={`translate(${frame.left + frame.width - 30 - 337} ${frame.top + 32 - 74})`}>
          <circle
            cx="337"
            cy="74"
            r={19 + breath * 4}
            fill="none"
            stroke="#a3b78a"
            strokeWidth="1"
            opacity=".55"
          />
          <circle cx="337" cy="74" r="13" fill="#ecf2e4" />
          <text x="337" y="77" textAnchor="middle" fontSize="6" fill="#81976d" letterSpacing=".8">
            BREATHE
          </text>
        </g>
      )}
    </>
  )
}

export function ExerciseThumbnail({
  exerciseId,
  compact = false,
}: {
  exerciseId: string
  compact?: boolean
}) {
  const demo = demos[exerciseId]
  if (!demo) return null
  const showEnd = [
    'squat',
    'reverse-lunge',
    'split-squat',
    'glute-bridge',
    'single-leg-bridge',
    'deadbug',
    'reverse-snow-angel',
    'prone-pulldown',
  ].includes(exerciseId)
  const pose = showEnd ? demo.end : demo.start
  const frame = sceneFrame(compact ? { ...demo, start: pose } : demo, exerciseId, compact)
  return (
    <svg
      className={`exercise-thumbnail ${compact ? 'compact' : ''}`}
      viewBox={`${frame.left} ${frame.top} ${frame.width} ${frame.height}`}
      aria-hidden="true"
      focusable="false"
    >
      <ExerciseScene demo={demo} pose={pose} exerciseId={exerciseId} compact={compact} />
    </svg>
  )
}

const KneePushupGuide = lazy(() => import('./form-guide/KneePushupGuide'))

export default function ExerciseGuide({ exercise }: { exercise: Exercise }) {
  if (exercise.id === 'knee-pushup') {
    return (
      <Suspense
        fallback={
          <p className="guide-caption" role="status">
            Preparing your form guide…
          </p>
        }
      >
        <KneePushupGuide fallback={<LegacyExerciseGuide exercise={exercise} />} />
      </Suspense>
    )
  }
  return <LegacyExerciseGuide exercise={exercise} />
}

function LegacyExerciseGuide({ exercise }: { exercise: Exercise }) {
  const demo = demos[exercise.id]
  const [playing, setPlaying] = useState(false),
    [phase, setPhase] = useState(0),
    [speed, setSpeed] = useState(1)
  const phaseRef = useRef(0)
  useEffect(() => {
    if (!playing) return
    let previous = 0,
      frame = 0
    const tick = (time: number) => {
      if (previous) {
        phaseRef.current = (phaseRef.current + (Math.min(100, time - previous) / 6000) * speed) % 1
        setPhase(phaseRef.current)
      }
      previous = time
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, speed])
  // Eccentric pull-ups reset using the bench instead of depicting an unassisted pull-up.
  const negative = exercise.id === 'negative-pullup'
  const resetting = negative && phase >= 0.75
  const t = negative ? Math.min(1, phase / 0.75) : (1 - Math.cos(phase * 2 * Math.PI)) / 2
  const body = interpolate(demo.start, demo.end, t, exercise.id)
  const frame = sceneFrame(demo, exercise.id)
  return (
    <section className="exercise-guide" aria-label={`${exercise.name} animated guide`}>
      <div className="guide-label">
        <span>
          <span className="status-dot" /> ANIMATED FORM GUIDE
        </span>
        <span>{demo.view}</span>
      </div>
      <svg
        viewBox={`${frame.left} ${frame.top} ${frame.width} ${frame.height}`}
        className="guide-canvas"
        role="img"
        aria-label={`${exercise.name}: ${phase < 0.5 ? demo.action : demo.reset}`}
      >
        <ExerciseScene
          demo={demo}
          pose={body}
          exerciseId={exercise.id}
          breath={t}
          resetting={resetting}
        />
      </svg>
      <div className="guide-cue">
        {negative
          ? resetting
            ? 'Step onto your stable bench to reset at the top'
            : demo.action
          : phase < 0.5
            ? demo.action
            : demo.reset}
      </div>
      <div className="guide-controls">
        <button
          className="guide-play"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? 'Pause animation' : 'Play animation'}
        >
          {playing ? (
            <Pause size={16} fill="currentColor" />
          ) : (
            <Play size={16} fill="currentColor" />
          )}
          <span>{playing ? 'Pause' : 'Play guide'}</span>
        </button>
        <div className="guide-track">
          <i style={{ width: `${phase * 100}%` }} />
        </div>
        <button
          aria-label="Restart animation"
          onClick={() => {
            phaseRef.current = 0
            setPhase(0)
          }}
        >
          <RotateCcw size={14} />
        </button>
        <button
          className="guide-speed"
          aria-label={`Playback speed ${speed}x`}
          onClick={() => setSpeed(speed === 1 ? 0.5 : 1)}
        >
          {speed}×
        </button>
      </div>
      <p className="guide-caption">Exercise illustration · Reps per side where indicated below.</p>
    </section>
  )
}
