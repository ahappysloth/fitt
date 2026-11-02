import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Dumbbell,
  Monitor,
  Moon,
  Share,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  SquarePlus,
  TrendingUp,
  Trophy,
  WifiOff,
  Zap,
} from 'lucide-react'
import { FMark } from './FittArtwork'
import { Button, Pill } from './ui'
import './help-dialogs.css'

const progressSteps = [
  {
    icon: Dumbbell,
    title: 'Start with what you have.',
    copy: 'Choose your equipment and experience. Follow your plan, swap a movement, or build your own.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Make each set yours.',
    copy: 'Log your actual reps, hold time, and added weight. Tell Fitt how it felt so the next sets can adapt.',
  },
  {
    icon: TrendingUp,
    title: 'Grow when you’re ready.',
    copy: 'Repeat a target with control. Fitt adds a little more when your recent sessions show you’re ready.',
  },
  {
    icon: Trophy,
    title: 'Celebrate showing up.',
    copy: 'Short sessions count. Earn XP, unlock milestones, and build a rhythm that fits your life.',
  },
]

export function ProgressHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="help-dialog">
      <div className="help-intro">
        <span className="help-symbol" aria-hidden="true">
          <Sparkles size={25} />
        </span>
        <div>
          <p className="eyebrow">BUILT AROUND YOU</p>
          <h3>A little stronger. On your terms.</h3>
          <p>You don’t need a perfect streak. Just a place to start.</p>
        </div>
      </div>
      <ol className="help-steps">
        {progressSteps.map((step, index) => (
          <li key={step.title}>
            <span className="help-step-icon" aria-hidden="true">
              <step.icon size={21} />
              <span>{index + 1}</span>
            </span>
            <div>
              <h4>{step.title}</h4>
              <p>{step.copy}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="help-note">
        <Moon size={20} aria-hidden="true" />
        <p>
          <strong>Rest is part of progress.</strong> Your earned XP and awards stay yours. Move with
          control, recover between sessions, and stop if something hurts.
        </p>
      </div>
      <details className="help-details">
        <summary>
          How targets and XP work <ChevronDown size={17} aria-hidden="true" />
        </summary>
        <div>
          <p>
            Two complete, controlled sessions at your target unlock a small increase: one rep or
            five seconds. At the top of the range, Fitt may introduce a harder available variation
            or added load. A hard or incomplete set adjusts your remaining targets.
          </p>
          <p>
            Earn 5 XP per logged set, 35 for saving a workout, 15 for a new comparable personal
            best, and 25 for your weekly goal. Each 250 XP earns a level.
          </p>
          <p>
            Your first saved workout fixes this week’s goal; changes apply to the next fresh week.
            Five-minute sessions count, too.
          </p>
        </div>
      </details>
      <Button className="help-done" onClick={onClose}>
        Find my next step <ArrowRight size={17} aria-hidden="true" />
      </Button>
    </div>
  )
}

export function InstallHelp({
  accountMode,
  onClose,
}: {
  accountMode: boolean
  onClose: () => void
}) {
  return (
    <div className="help-dialog install-help">
      <div className="help-intro">
        <span className="help-app-icon" aria-hidden="true">
          <FMark />
        </span>
        <div>
          <p className="eyebrow">A PLACE ON YOUR HOME SCREEN</p>
          <h3>Your next rep, one tap away.</h3>
          <p>Open your training space directly. No app store needed.</p>
        </div>
      </div>
      <div className="install-benefits">
        <Pill>
          <WifiOff aria-hidden="true" /> Offline workouts
        </Pill>
        <Pill>
          <Zap aria-hidden="true" /> Quick access
        </Pill>
      </div>
      <section className="install-platform">
        <h4>
          <Smartphone size={20} aria-hidden="true" /> iPhone or iPad
        </h4>
        <ol>
          <li>Open Fitt in Safari.</li>
          <li>
            Tap <Share size={15} aria-hidden="true" /> <strong>Share</strong> in the browser.
          </li>
          <li>
            Choose <SquarePlus size={15} aria-hidden="true" /> <strong>Add to Home Screen</strong>,
            then Add.
          </li>
        </ol>
      </section>
      <section className="install-platform">
        <h4>
          <Monitor size={20} aria-hidden="true" /> Android or desktop
        </h4>
        <ol>
          <li>Open your browser’s menu or installation icon.</li>
          <li>
            Choose <Download size={15} aria-hidden="true" /> <strong>Install app</strong> or{' '}
            <strong>Add to Home Screen</strong>.
          </li>
          <li>Confirm, then launch Fitt from its new icon.</li>
        </ol>
      </section>
      <div className="help-note">
        <WifiOff size={20} aria-hidden="true" />
        <p>
          <strong>Take a moment online first.</strong> When Fitt shows “Ready for offline training,”
          your workout tools and guides are ready to go with you.
        </p>
      </div>
      <details className="help-details">
        <summary>
          <span>
            <ShieldCheck size={16} aria-hidden="true" /> What happens to my progress?
          </span>
          <ChevronDown size={17} aria-hidden="true" />
        </summary>
        <div>
          <p>
            {accountMode
              ? 'Wait for your account to finish syncing before changing devices. Active workouts and unsynced changes stay in this browser; export a backup to keep them.'
              : 'Your workouts are saved in this browser. Export a backup before changing devices or domains, or sign in to sync completed workouts with your account.'}
          </p>
        </div>
      </details>
      <Button className="help-done" onClick={onClose}>
        Got it <Check size={17} aria-hidden="true" />
      </Button>
    </div>
  )
}
