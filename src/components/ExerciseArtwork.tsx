import { useId } from 'react'

export type Point = [number, number]
export type AthletePose = {
  head: Point
  shoulder: Point
  elbow: Point
  hand: Point
  hip: Point
  knee: Point
  foot: Point
  elbow2?: Point
  hand2?: Point
  knee2?: Point
  foot2?: Point
}

const mix = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
]
const add = (a: Point, b: Point, amount: number): Point => [
  a[0] + b[0] * amount,
  a[1] + b[1] * amount,
]
const axis = (a: Point, b: Point): Point => {
  const distance = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  return [(b[0] - a[0]) / distance, (b[1] - a[1]) / distance]
}
const point = (p: Point) => `${p[0]},${p[1]}`

/** Intersect the two bone-length circles and retain the intended bend direction. */
function jointBetween(from: Point, to: Point, hint: Point, upper: number, lower: number): Point {
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1])
  if (distance < 0.01) return hint
  const along = axis(from, to)
  if (distance >= upper + lower - 0.1) return add(from, along, (distance * upper) / (upper + lower))
  const reach = (upper * upper - lower * lower + distance * distance) / (2 * distance)
  const height = Math.sqrt(Math.max(0, upper * upper - reach * reach))
  const center = add(from, along, reach)
  const perpendicular: Point = [-along[1], along[0]]
  const first = add(center, perpendicular, height)
  const second = add(center, perpendicular, -height)
  return Math.hypot(first[0] - hint[0], first[1] - hint[1]) <
    Math.hypot(second[0] - hint[0], second[1] - hint[1])
    ? first
    : second
}

/** A tapered anatomical contour, with a full muscle belly and a narrower joint. */
function Segment({
  from,
  to,
  start,
  end,
  fill,
  shade = false,
}: {
  from: Point
  to: Point
  start: number
  end: number
  fill: string
  shade?: boolean
}) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  const angle = (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI
  return (
    <g transform={`translate(${point(from)}) rotate(${angle})`}>
      <path
        d={`M0 ${-start} C${length * 0.3} ${-start * 1.13} ${length * 0.65} ${-end * 1.35} ${length} ${-end}
          Q${length + end * 0.8} 0 ${length} ${end}
          C${length * 0.6} ${end * 1.35} ${length * 0.25} ${start * 1.1} 0 ${start}
          Q${-start * 0.9} 0 0 ${-start}Z`}
        fill={fill}
      />
      {shade && (
        <path
          d={`M${length * 0.12} ${start * 0.54} Q${length * 0.5} ${end * 0.68} ${length * 0.86} ${end * 0.53}`}
          fill="none"
          stroke="#895d46"
          strokeOpacity=".2"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      )}
    </g>
  )
}

function Shoe({
  ankle,
  direction = 1,
  angle = 0,
  far = false,
}: {
  ankle: Point
  direction?: number
  angle?: number
  far?: boolean
}) {
  return (
    <g transform={`translate(${point(ankle)}) rotate(${angle}) scale(${direction} 1)`}>
      <path
        d="M-6-5Q0-7 5-3L9 0 15 2Q18 3 18 6L16 8H-8Q-11 5-9 1Z"
        fill={far ? '#aeb8ab' : '#e9ede3'}
        stroke={far ? '#9ca894' : '#c3ccbb'}
        strokeWidth=".8"
      />
      <path d="M-9 5Q4 7 17 5" fill="none" stroke={far ? '#7e8e78' : '#7e9079'} strokeWidth="2" />
      <path d="M0-2 6 1M-2 0 4 3" stroke={far ? '#d5dbcf' : '#fffef4'} strokeWidth="1.2" />
      <path d="M-7-3-5 3" stroke={far ? '#82947c' : '#6c856b'} strokeWidth="2.4" />
    </g>
  )
}

function Hand({
  wrist,
  elbow,
  fill,
  floor,
}: {
  wrist: Point
  elbow: Point
  fill: string
  floor: boolean
}) {
  const direction = axis(elbow, wrist)
  const angle = floor ? 0 : (Math.atan2(direction[1], direction[0]) * 180) / Math.PI - 90
  return (
    <g transform={`translate(${point(wrist)}) rotate(${angle})`}>
      <path d="M-4-5Q0-7 4-4L5 1 8 4Q9 6 7 7L-5 7Q-8 5-6 2Z" fill={fill} />
      <path
        d="M-3 4 5 5M-2 1 4 3"
        stroke="#80563f"
        strokeOpacity=".2"
        strokeWidth=".7"
        strokeLinecap="round"
      />
    </g>
  )
}

/** Original articulated vector athlete. Joint coordinates carry the exercise motion;
 * body contours, lighting, clothing, and layered limbs give it a consistent silhouette. */
export function AthleteFigure({
  pose,
  view = 'SIDE VIEW',
  facing = 1,
  compact = false,
  toesOnFloor = false,
}: {
  pose: AthletePose
  view?: 'SIDE VIEW' | 'FRONT VIEW' | 'TOP VIEW'
  facing?: 1 | -1
  compact?: boolean
  toesOnFloor?: boolean
}) {
  const id = useId().replace(/:/g, '')
  const fill = (name: string) => `url(#${id}-${name})`
  const frontal = view !== 'SIDE VIEW'
  const top = view === 'TOP VIEW'
  const direction = axis(pose.shoulder, pose.hip)
  const normal: Point = [-direction[1], direction[0]]
  const shoulderWidth = frontal ? 20 : 14
  const hipWidth = frontal ? 13 : 12
  const leftShoulder = add(pose.shoulder, normal, frontal ? 16 : 0)
  const rightShoulder = add(pose.shoulder, normal, frontal ? -16 : -4)
  const leftHip = add(pose.hip, normal, frontal ? 7 : 0)
  const rightHip = add(pose.hip, normal, frontal ? -7 : -4)
  const waist = mix(pose.shoulder, pose.hip, 0.76)
  const torsoTop = add(pose.shoulder, direction, -3)
  const headAngle =
    (Math.atan2(pose.head[1] - pose.shoulder[1], pose.head[0] - pose.shoulder[0]) * 180) / Math.PI +
    90
  const torsoPath = `M${point(add(torsoTop, normal, shoulderWidth))}
    C${point(add(mix(pose.shoulder, pose.hip, 0.25), normal, shoulderWidth + 1))} ${point(add(waist, normal, hipWidth - 3))} ${point(add(pose.hip, normal, hipWidth))}
    Q${point(add(pose.hip, direction, 6))} ${point(add(pose.hip, normal, -hipWidth))}
    C${point(add(waist, normal, -hipWidth + 3))} ${point(add(mix(pose.shoulder, pose.hip, 0.25), normal, -shoulderWidth - 1))} ${point(add(torsoTop, normal, -shoulderWidth))}
    Q${point(add(torsoTop, direction, -8))} ${point(add(torsoTop, normal, shoulderWidth))}Z`

  function leg(hip: Point, knee: Point, ankle: Point, far: boolean) {
    const toeSupport = toesOnFloor && ankle[1] >= 200
    const referenceAxis = axis(hip, ankle)
    const kneeOffset = Math.abs(
      (knee[0] - hip[0]) * referenceAxis[1] - (knee[1] - hip[1]) * referenceAxis[0],
    )
    const straightLeg = toeSupport && kneeOffset <= 5
    if (toeSupport) ankle = [ankle[0], 201]
    // Toe support slightly foreshortens the leg in this side projection. Preserve
    // the intended straight knee instead of inventing a bend to fill bone lengths.
    knee = straightLeg
      ? mix(hip, ankle, 45 / 88)
      : jointBetween(hip, ankle, knee, frontal ? 42 : 45, frontal ? 40 : 43)
    const skin = far ? fill('skin-far') : fill('skin')
    const shorts = far ? '#253f37' : fill('shorts')
    return (
      <>
        <Segment
          from={hip}
          to={knee}
          start={frontal ? 10 : 11.5}
          end={6.3}
          fill={skin}
          shade={!far}
        />
        <Segment from={knee} to={ankle} start={6.4} end={3.8} fill={skin} shade={!far} />
        <Segment
          from={hip}
          to={mix(hip, knee, 0.48)}
          start={frontal ? 11.6 : 13}
          end={frontal ? 9.7 : 11.2}
          fill={shorts}
        />
        <path
          d={`M${point(add(mix(hip, knee, 0.43), normal, -6))}l${normal[0] * 13},${normal[1] * 13}`}
          stroke={far ? '#3a5348' : '#5c7664'}
          strokeWidth="1"
          opacity=".5"
        />
        <Shoe
          ankle={ankle}
          direction={frontal ? (hip[0] < pose.hip[0] ? -1 : 1) : 1}
          angle={toeSupport ? 100 : 0}
          far={far}
        />
      </>
    )
  }

  function arm(shoulder: Point, elbow: Point, wrist: Point, far: boolean) {
    elbow = jointBetween(shoulder, wrist, elbow, 34, 33)
    const skin = far ? fill('skin-far') : fill('skin')
    return (
      <>
        <Segment from={shoulder} to={elbow} start={7.6} end={5.1} fill={skin} shade={!far} />
        <Segment from={elbow} to={wrist} start={5.6} end={3.2} fill={skin} shade={!far} />
        <Hand wrist={wrist} elbow={elbow} fill={skin} floor={wrist[1] >= 200} />
      </>
    )
  }

  return (
    <g className="athlete-figure">
      <defs>
        <linearGradient id={`${id}-skin`} x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="#dbb48e" />
          <stop offset=".52" stopColor="#c69670" />
          <stop offset="1" stopColor="#a97856" />
        </linearGradient>
        <linearGradient id={`${id}-skin-far`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#b98f6c" />
          <stop offset="1" stopColor="#956c50" />
        </linearGradient>
        <linearGradient id={`${id}-jersey`} x1="0" y1="0" x2="1" y2=".5">
          <stop stopColor="#a5b991" />
          <stop offset=".45" stopColor="#89a279" />
          <stop offset="1" stopColor="#627f60" />
        </linearGradient>
        <linearGradient id={`${id}-shorts`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#344d42" />
          <stop offset=".55" stopColor="#263e34" />
          <stop offset="1" stopColor="#1c3028" />
        </linearGradient>
        <linearGradient id={`${id}-hair`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#39453b" />
          <stop offset="1" stopColor="#202b23" />
        </linearGradient>
      </defs>

      {/* The far side is rendered first, keeping the visible limb silhouette clear. */}
      {pose.knee2 && pose.foot2 && leg(rightHip, pose.knee2, pose.foot2, true)}
      {!frontal &&
        !pose.knee2 &&
        leg(add(leftHip, [0, -1], 3), add(pose.knee, [0, -1], 4), add(pose.foot, [0, -1], 3), true)}
      {pose.elbow2 && pose.hand2 && arm(rightShoulder, pose.elbow2, pose.hand2, true)}
      {!frontal &&
        !pose.elbow2 &&
        arm(
          add(rightShoulder, [0, -1], 2),
          add(pose.elbow, [0, -1], 5),
          add(pose.hand, [-1, 0], 9),
          true,
        )}

      {leg(leftHip, pose.knee, pose.foot, false)}
      <Segment from={pose.shoulder} to={pose.head} start={6.2} end={5.5} fill={fill('skin')} />
      <path
        d={torsoPath}
        fill={fill('jersey')}
        stroke="#597353"
        strokeOpacity=".35"
        strokeWidth=".7"
      />
      {/* Panel seams and soft fabric folds follow the torso's moving axis. */}
      <path
        d={`M${point(add(mix(pose.shoulder, pose.hip, 0.2), normal, shoulderWidth - 4))}Q${point(add(waist, normal, hipWidth - 7))} ${point(add(pose.hip, normal, hipWidth - 4))}`}
        fill="none"
        stroke="#d4dfbf"
        strokeOpacity=".35"
        strokeWidth="1.2"
      />
      <path
        d={`M${point(add(waist, normal, -hipWidth + 1))}Q${point(add(mix(waist, pose.hip, 0.4), normal, -3))} ${point(add(pose.hip, normal, hipWidth - 2))}`}
        fill="none"
        stroke="#4b694b"
        strokeOpacity=".24"
        strokeWidth="1.2"
      />
      <path
        d={`M${point(add(pose.shoulder, normal, -7))}Q${point(add(pose.shoulder, direction, 10))} ${point(add(pose.shoulder, normal, 7))}`}
        fill="none"
        stroke="#d9e3c6"
        strokeOpacity=".7"
        strokeWidth="1.4"
      />
      <path
        d={`M${point(add(pose.hip, normal, -hipWidth))}Q${point(add(pose.hip, direction, 3))} ${point(add(pose.hip, normal, hipWidth))}`}
        fill="none"
        stroke="#1d352b"
        strokeWidth="3.6"
      />
      {arm(leftShoulder, pose.elbow, pose.hand, false)}
      {frontal && pose.elbow2 && pose.hand2 && arm(rightShoulder, pose.elbow2, pose.hand2, false)}
      <g
        transform={`translate(${point(pose.head)}) rotate(${frontal ? 0 : headAngle}) scale(${frontal ? 1 : facing} 1)`}
      >
        {frontal ? (
          <>
            <ellipse cx="-10" cy="1" rx="2.3" ry="3.8" fill="#b48360" />
            <ellipse cx="10" cy="1" rx="2.3" ry="3.8" fill="#b48360" />
            <path d="M-10-7Q-9-14 0-14T10-7L9 5Q7 13 0 14Q-7 13-9 5Z" fill={fill('skin')} />
            <path d="M-11 0Q-15-16-2-17Q13-18 12-4L9 1 7-8Q1-4-7-7L-9 1Z" fill={fill('hair')} />
            {!top && !compact && (
              <>
                <path d="M-6 1h2M4 1h2" stroke="#594938" strokeWidth="1" strokeLinecap="round" />
                <path
                  d="M0 2-1 6h2M-3 9q3 1 6 0"
                  fill="none"
                  stroke="#916849"
                  strokeWidth=".75"
                  strokeLinecap="round"
                />
              </>
            )}
            {top && <path d="M-8-4Q1-10 9-3L8 5Q0 10-8 5Z" fill={fill('hair')} />}
          </>
        ) : (
          <>
            <path
              d="M-8-10Q0-16 8-10Q11-7 9-1L13 3Q13 5 9 5L8 10Q5 14 0 11L-6 8-10 0Z"
              fill={fill('skin')}
            />
            <path
              d="M-9 4Q-16-4-10-13Q-4-19 6-15Q13-13 11-7Q4-6 1-10L-3-5-5 3Z"
              fill={fill('hair')}
            />
            <ellipse cx="-3" cy="1" rx="2.7" ry="3.6" fill="#c99c77" />
            {!compact && (
              <>
                <path
                  d="M6 0h2M7 8h2M-3 0q-2 2 0 3"
                  stroke="#6d503c"
                  strokeWidth=".8"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  d="M-9-9Q-3-14 5-11"
                  stroke="#626a55"
                  strokeWidth="1"
                  opacity=".45"
                  fill="none"
                />
              </>
            )}
          </>
        )}
      </g>
    </g>
  )
}
