import { useId } from 'react'
import type { Muscle } from '../lib/types'
import { muscleNames } from '../lib/catalog'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <path d="M5 23V5h21v5H11v4h12v5H11v4z" fill="currentColor" />
        </svg>
      </span>
      {!compact && (
        <span>
          fitt<span className="brand-dot">.</span>
        </span>
      )}
    </div>
  )
}

export function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 340 340" aria-hidden="true">
      <defs>
        <linearGradient id="arc" x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#83a47c" stopOpacity=".08" />
          <stop offset="1" stopColor="#b8dd99" stopOpacity=".5" />
        </linearGradient>
      </defs>
      <circle cx="191" cy="165" r="132" fill="none" stroke="url(#arc)" strokeWidth="1" />
      <circle cx="191" cy="165" r="103" fill="none" stroke="#b8dd99" strokeOpacity=".15" />
      <path d="M58 307 282 66M105 338 329 97" stroke="#a3c48e" strokeOpacity=".1" />
      <path d="M81 0v115M280 0v115" stroke="#97af91" strokeWidth="3" />
      <ellipse cx="81" cy="132" rx="18" ry="25" fill="none" stroke="#cad3ba" strokeWidth="6" />
      <ellipse cx="280" cy="132" rx="18" ry="25" fill="none" stroke="#cad3ba" strokeWidth="6" />
      <path
        d="m177 176-41 1-30-31-25-15m118 43 37-4 28-27 15-12"
        fill="none"
        stroke="#d8b595"
        strokeWidth="17"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m168 166 25-5 23 50-17 41-48-12 3-39z" fill="#c2e890" />
      <path d="m171 173-8 39m34-35 5 27" stroke="#8eb75d" strokeWidth="2" />
      <path
        d="m157 239-6 43 33 41m14-76 26 37 33 13"
        fill="none"
        stroke="#162c25"
        strokeWidth="23"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m184 321 11 9 13-1m48-33 13 5 10-5"
        fill="none"
        stroke="#e8e7cf"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path d="m178 163-3-16" stroke="#d8b595" strokeWidth="14" />
      <ellipse cx="176" cy="135" rx="18" ry="22" transform="rotate(-10 176 135)" fill="#d8b595" />
      <path
        d="M160 138c-8-13-2-27 11-29 16-5 27 9 25 21-6-2-10-7-12-12-4 8-14 8-24 8z"
        fill="#152a24"
      />
      <path d="m264 231 7-7m-3-4v15m-7-7h15" stroke="#c2e890" strokeWidth="1.5" />
      <circle cx="111" cy="226" r="3" fill="#c2e890" />
      <circle cx="239" cy="73" r="3" fill="#c2e890" />
    </svg>
  )
}

export function MuscleMap({ muscles, small = false }: { muscles: Muscle[]; small?: boolean }) {
  const id = useId().replace(/:/g, '')
  const active = new Set(muscles)
  const region = (muscle: Muscle) => ({
    'data-muscle': muscle,
    'data-active': active.has(muscle),
    fill: `url(#${id}-${active.has(muscle) ? 'active' : 'rest'})`,
  })
  const silhouette =
    'M49 42V48C42 49 34 50 29 55C24 60 23 69 24 80L20 102 14 126 13 139 9 151Q7 158 13 159L20 148 23 133 28 111 32 90 36 80C38 96 39 108 41 122L37 139C34 155 34 176 38 194L39 213 42 235 37 245Q35 249 41 250H51L52 237 52 213 56 196 57 164 58 196 62 213 62 237 63 250H73Q79 249 77 245L72 235 75 213 76 194C80 176 80 155 77 139L73 122C75 108 76 96 78 80L82 90 86 111 91 133 94 148 101 159Q107 158 105 151L101 139 100 126 94 102 90 80C91 69 90 60 85 55C80 50 72 49 65 48V42Z'
  return (
    <div className={`muscle-map ${small ? 'small' : ''}`}>
      <svg
        viewBox="0 0 240 260"
        role="img"
        aria-label={`Muscles worked: ${[...active].map((m) => muscleNames[m]).join(', ') || 'none yet'}`}
      >
        <defs>
          <linearGradient id={`${id}-active`} x1="0" y1="0" x2="1" y2=".8">
            <stop stopColor="#a3c67c" />
            <stop offset=".5" stopColor="#8eb366" />
            <stop offset="1" stopColor="#799d58" />
          </linearGradient>
          <linearGradient id={`${id}-rest`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#e0e6d8" />
            <stop offset="1" stopColor="#ccd6c3" />
          </linearGradient>
        </defs>
        {[false, true].map((back, index) => (
          <g
            key={String(back)}
            data-view={back ? 'back' : 'front'}
            transform={`translate(${index * 125} 0)`}
          >
            <path d={silhouette} fill="#e9ede3" stroke="#cdd6c4" strokeWidth=".7" />
            <path
              d="M47 24C46 15 50 10 57 10S68 15 67 24L68 28 65 33Q64 41 57 43Q50 41 49 33L46 28Z"
              fill={`url(#${id}-rest)`}
              stroke="#cdd6c4"
              strokeWidth=".7"
            />
            <path
              d={back ? 'M51 38Q57 35 63 38M57 43V49' : 'M57 25V30L59 31M54 36Q57 37 60 36'}
              fill="none"
              stroke="#aebda2"
              strokeWidth=".65"
              strokeLinecap="round"
            />
            {[false, true].map((mirror) => (
              <g
                key={String(mirror)}
                transform={mirror ? 'translate(114 0) scale(-1 1)' : undefined}
                stroke="#f4f6ef"
                strokeWidth="1"
                strokeLinejoin="round"
              >
                <path d="M35 54C27 55 24 64 25 76Q31 79 36 73L41 60Z" {...region('shoulders')} />
                <path
                  d={
                    back
                      ? 'M25 79Q30 80 33 76L30 98Q28 106 22 109L20 106Z'
                      : 'M25 79Q29 82 33 79L30 98Q28 106 23 108L21 104Z'
                  }
                  {...region(back ? 'triceps' : 'biceps')}
                />
                <path d="M21 111Q25 111 27 108L21 133 16 140 16 130Z" {...region('forearms')} />
                {back ? (
                  <>
                    <path d="M49 46 55 47V73Q44 69 37 61L42 52Z" {...region('upper-back')} />
                    <path d="M37 75Q45 75 55 79L52 105 44 119 40 105Z" {...region('upper-back')} />
                    <path d="M50 107 55 98V132L44 135 45 123Z" {...region('lower-back')} />
                    <path
                      d="M41 135Q47 131 55 135V153Q46 160 37 151Q36 142 41 135Z"
                      {...region('glutes')}
                    />
                    <path
                      d="M38 156Q46 161 54 156L52 183Q49 192 42 191C39 182 37 169 38 156Z"
                      {...region('hamstrings')}
                    />
                    <path
                      d="M47 162 45 183M43 84 50 110M44 61 51 66"
                      fill="none"
                      stroke="#657d50"
                      strokeWidth=".7"
                      opacity=".2"
                    />
                  </>
                ) : (
                  <>
                    <path d="M38 62Q46 58 55 62V82Q45 87 37 79Z" {...region('chest')} />
                    <path d="M38 86 44 91V117L41 123 39 111Z" {...region('core')} />
                    {[88, 98, 108].map((y) => (
                      <path
                        key={y}
                        d={`M47 ${y}Q51 ${y - 2} 55 ${y - 1}V${y + 6}Q51 ${y + 8} 47 ${y + 6}Z`}
                        {...region('core')}
                      />
                    ))}
                    <path d="M46 119 55 118V132L48 128Z" {...region('core')} />
                    <path
                      d="M38 156Q45 160 54 156L52 182Q48 194 42 190C39 182 37 168 38 156Z"
                      {...region('quads')}
                    />
                    <path
                      d="M43 162Q42 177 46 186M41 65Q47 64 52 66"
                      fill="none"
                      stroke="#657d50"
                      strokeWidth=".7"
                      opacity=".2"
                    />
                  </>
                )}
                {back ? (
                  <path d="M41 203Q47 199 51 203L49 220Q47 228 44 229Z" {...region('calves')} />
                ) : (
                  <path d="M41 203Q47 199 51 203L49 220Q47 228 44 229Z" fill={`url(#${id}-rest)`} />
                )}
                <path
                  d="M42 195Q46 192 50 195M43 236 48 237M13 145 12 152"
                  fill="none"
                  stroke="#bac7ae"
                  strokeWidth=".8"
                />
              </g>
            ))}
            <path
              d={back ? 'M57 51V132M57 136V155' : 'M57 61V82M41 137 57 145 73 137'}
              fill="none"
              stroke="#bdcbb0"
              strokeWidth=".7"
            />
          </g>
        ))}
      </svg>
      {!small && (
        <div className="map-labels">
          <span>FRONT</span>
          <span>BACK</span>
        </div>
      )}
    </div>
  )
}
