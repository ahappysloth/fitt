import { useId } from 'react'

export function FMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M5 23V5h21v5H11v4h12v5H11v4z" fill="currentColor" />
    </svg>
  )
}

export function SparkBuddy({ small = false }: { small?: boolean }) {
  const id = useId()
  return (
    <svg className={`spark-buddy ${small ? 'small' : ''}`} viewBox="0 0 300 310" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-body`} x1=".15" y1="0" x2=".85" y2="1">
          <stop stopColor="#edffbd" />
          <stop offset=".24" stopColor="var(--accent)" />
          <stop offset=".7" stopColor="#89bd26" />
          <stop offset="1" stopColor="#425912" />
        </linearGradient>
        <linearGradient id={`${id}-side`} x1="0" y1="0" x2="1" y2=".6">
          <stop stopColor="#44522b" />
          <stop offset=".4" stopColor="#181e12" />
          <stop offset="1" stopColor="#070b05" />
        </linearGradient>
        <radialGradient id={`${id}-shine`} cx=".3" cy=".2" r=".8">
          <stop stopColor="#f7ffde" stopOpacity=".8" />
          <stop offset="1" stopColor="#d4ff7a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-shadow`}>
          <stop stopColor="#000" stopOpacity=".7" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="155" cy="282" rx="99" ry="18" fill={`url(#${id}-shadow)`} />
      <g className="buddy-float" transform="rotate(-9 150 150)">
        <path
          d="M95 184Q68 172 58 192Q48 211 58 218Q67 225 78 212L103 202"
          fill={`url(#${id}-body)`}
        />
        <path
          d="M216 155Q237 149 246 128Q252 115 262 122Q273 130 265 145Q255 173 230 181"
          fill={`url(#${id}-body)`}
        />
        <path
          d="M113 224 108 258Q97 267 105 274Q120 283 141 272L146 228M172 226 183 257Q203 257 206 268Q204 279 187 279Q169 276 162 268L151 235"
          fill={`url(#${id}-side)`}
        />
        <path
          d="M92 86C92 61 113 50 145 48L186 47C216 49 232 69 231 99L228 174C227 213 207 239 166 243L134 240C105 237 89 218 87 189Z"
          fill={`url(#${id}-body)`}
          stroke="#d7f9a3"
          strokeOpacity=".25"
        />
        <path
          d="M99 94C100 69 122 59 159 59L187 58Q216 60 217 91L213 154Q196 109 157 109Q125 110 99 132Z"
          fill={`url(#${id}-shine)`}
        />
        <path d="M93 148Q148 165 229 141L228 173Q172 196 89 177Z" fill={`url(#${id}-side)`} />
        <ellipse cx="133" cy="155" rx="8" ry="12" fill="#edffb5" />
        <ellipse cx="187" cy="151" rx="8" ry="12" fill="#edffb5" />
        <circle cx="135" cy="151" r="3" fill="white" />
        <circle cx="189" cy="147" r="3" fill="white" />
        <path
          d="M150 180Q162 188 175 178"
          fill="none"
          stroke="#2b3a13"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M145 218v-20h20v5h-14v4h11v5h-11v6z" fill="#28380d" opacity=".7" />
        <path
          d="M111 83Q122 73 145 72"
          fill="none"
          stroke="#f5ffdc"
          strokeWidth="4"
          strokeLinecap="round"
          opacity=".65"
        />
      </g>
      {!small && (
        <>
          <path
            d="M251 70v18m-9-9h18M55 112v11m-5-5h11"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="237" cy="227" r="4" fill="var(--accent)" />
          <circle cx="63" cy="66" r="3" fill="var(--accent)" opacity=".4" />
        </>
      )}
    </svg>
  )
}

export function TrophyArt({ medal = false }: { medal?: boolean }) {
  const id = useId()
  return (
    <svg className={`trophy-art ${medal ? 'medal' : ''}`} viewBox="0 0 260 260" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2=".5">
          <stop stopColor="#4d691a" />
          <stop offset=".24" stopColor="var(--accent)" />
          <stop offset=".43" stopColor="#f0ffd0" />
          <stop offset=".65" stopColor="#a5cd36" />
          <stop offset="1" stopColor="#31480e" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f2ffd4" />
          <stop offset=".45" stopColor="var(--accent)" />
          <stop offset="1" stopColor="#5c7f1a" />
        </linearGradient>
        <linearGradient id={`${id}-base`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#4a5044" />
          <stop offset=".5" stopColor="#24281f" />
          <stop offset="1" stopColor="#10130c" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop stopColor="var(--accent)" stopOpacity=".19" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="130" cy="125" r="124" fill={`url(#${id}-glow)`} />
      {medal ? (
        <g transform="rotate(-12 130 130)">
          <path d="m87 160-13 73 43-21 30 30 12-78" fill="#3c4829" />
          <path d="m94 165-8 52 32-17 19 21 11-55" fill="var(--accent)" opacity=".5" />
          <circle cx="132" cy="115" r="76" fill={`url(#${id}-gold)`} />
          <circle cx="127" cy="110" r="69" fill={`url(#${id}-rim)`} />
          <circle cx="127" cy="110" r="54" fill="#93b638" stroke="#d9f89e" strokeWidth="2" />
          <path
            d="m127 75 10 22 25 3-18 17 4 24-21-12-21 12 4-24-18-17 25-3Z"
            fill={`url(#${id}-gold)`}
            stroke="#4d691a"
            strokeWidth="1.5"
          />
        </g>
      ) : (
        <g transform="rotate(10 130 135)">
          <path
            d="M75 81H48Q39 82 44 105Q50 140 84 143M185 81h27q9 1 4 24-6 35-40 38"
            fill="none"
            stroke="#597d1b"
            strokeWidth="13"
          />
          <path
            d="M75 78H48Q39 79 44 102Q50 137 84 140M185 78h27q9 1 4 24-6 35-40 38"
            fill="none"
            stroke={`url(#${id}-rim)`}
            strokeWidth="8"
          />
          <path d="M116 155v31q-2 12-23 19h74q-21-7-23-19v-31" fill={`url(#${id}-gold)`} />
          <path d="M68 61H192L181 119Q176 168 130 174Q84 168 79 119Z" fill={`url(#${id}-gold)`} />
          <ellipse cx="130" cy="60" rx="65" ry="16" fill={`url(#${id}-rim)`} />
          <ellipse cx="130" cy="57" rx="55" ry="10" fill="#3e5515" />
          <path d="M78 59Q130 39 184 59" fill="none" stroke="#e6ffb1" strokeWidth="2" />
          <path
            d="M88 81q4 59 28 69"
            fill="none"
            stroke="#f0ffbf"
            strokeWidth="5"
            strokeLinecap="round"
            opacity=".5"
          />
          <path d="M119 133v-27h28v7h-20v5h16v7h-16v8Z" fill="#476318" opacity=".75" />
          <path d="m91 202-8 27h94l-8-27Z" fill={`url(#${id}-base)`} />
          <ellipse cx="130" cy="203" rx="39" ry="7" fill="#4c573e" />
          <path d="M85 229h90" stroke="#76805c" strokeWidth="2" />
        </g>
      )}
    </svg>
  )
}
