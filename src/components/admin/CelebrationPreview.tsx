import { ArrowRight, Check, Heart, Star, TrendingUp, Trophy, Zap } from 'lucide-react'
import { TrophyArt } from '../FittArtwork'
import { Confetti, CountUp, Pill } from './studio-primitives'

interface CelebrationPreviewProps {
  calm: boolean
  complete: boolean
  setsLogged: number
  earnedXP: number
  best: boolean
  level: number
  onPrimaryAction: () => void
  onClose: () => void
  primaryLabel?: string
  sample?: boolean
}

export default function CelebrationPreview({
  calm,
  complete,
  setsLogged,
  earnedXP,
  best,
  level,
  onPrimaryAction,
  onClose,
  primaryLabel = 'See my journey',
  sample = false,
}: CelebrationPreviewProps) {
  return (
    <div className="celebration-content">
      <Confetti calm={calm} />
      <Pill className="lime-pill">
        <Check size={13} />
        {sample ? 'SAMPLE WORKOUT' : 'WORKOUT SAVED'}
      </Pill>
      <div className="celebration-trophy">
        <TrophyArt />
      </div>
      <p className="eyebrow">YOU SHOWED UP FOR YOURSELF</p>
      <h2>{complete ? 'Look at you go.' : 'Showing up counts.'}</h2>
      <p>
        {complete
          ? 'A little stronger. A little more you.'
          : 'A small session is still a step forward.'}
      </p>
      <div className="earned-xp">
        <Zap size={27} fill="currentColor" />+<CountUp value={earnedXP} calm={calm} />
        <span>XP</span>
      </div>
      <div className="celebration-stats">
        <span>
          <strong>{setsLogged}</strong>sets logged
        </span>
        <span>
          <strong>3 / 3</strong>weekly goal
        </span>
        <span>
          <strong>{best ? '1' : '0'}</strong>personal best{best ? '' : 's'}
        </span>
      </div>
      <div className="level-up-banner">
        <span>
          <Star size={21} fill="currentColor" />
        </span>
        <div>
          <p>{level > 6 ? 'LEVEL UP' : 'KEEP BUILDING'}</p>
          <strong>
            {level > 6 ? `Hello, level ${level}.` : `Level ${level} looks good on you.`}
          </strong>
        </div>
        <span className="level-number">{String(level).padStart(2, '0')}</span>
      </div>
      <div className="unlocked-rewards">
        <span>
          <Trophy size={15} />
          <strong>Week winner</strong>+25 XP
        </span>
        {best && (
          <span>
            <TrendingUp size={15} />
            <strong>New personal best</strong>+15 XP
          </span>
        )}
      </div>
      <button type="button" className="primary-button" onClick={onPrimaryAction}>
        {primaryLabel} <ArrowRight size={17} />
      </button>
      <button type="button" className="celebration-close" onClick={onClose}>
        Take the good feeling with you <Heart size={13} />
      </button>
    </div>
  )
}
