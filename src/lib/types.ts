export type Equipment = 'bar' | 'rings' | 'bands' | 'parallettes' | 'bench' | 'vest'
export type Level = 'beginner' | 'intermediate'
export type Focus = 'full' | 'upper' | 'lower' | 'core'
export type Muscle =
  | 'chest'
  | 'upper-back'
  | 'lower-back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'core'
  | 'quads'
  | 'glutes'
  | 'hamstrings'
  | 'calves'
export type Pattern = 'push' | 'pull' | 'squat' | 'hinge' | 'core' | 'shoulder'
export type Effort = 'easy' | 'good' | 'hard'
export type BodyModel = 'male' | 'female'
export interface Exercise {
  id: string
  name: string
  pattern: Pattern
  equipment: Equipment[]
  muscles: Muscle[]
  level: number
  min: number
  max: number
  unit: 'reps' | 'sec'
  rest: number
  easier?: string
  harder?: string
  weighted?: boolean
  cue: string
  steps: string[]
}
export interface Profile {
  equipment: Equipment[]
  level: Level
  duration: 20 | 30 | 45
  focus: Focus
  weeklyGoal: number
}
export interface WorkoutSet {
  id: string
  target: number
  reps: number
  load: number
  targetLoad: number
  effort: Effort
  done: boolean
}
export interface WorkoutExercise {
  exerciseId: string
  sets: WorkoutSet[]
  note: string
}
export interface Workout {
  id: string
  title: string
  createdAt: string
  duration: number
  exercises: WorkoutExercise[]
}
export interface Session extends Workout {
  startedAt: string
  pausedAt?: string
  pausedSeconds?: number
  completedAt?: string
  elapsedSeconds?: number
  rewardContext?: {
    version: 1
    weeklyGoal: number
    localDay: string
  }
}
export interface UserPreferences {
  displayName: string
  celebration: 'playful' | 'calm'
  onboarded: boolean
  bodyModel?: BodyModel
}
export interface AppState {
  version: 1
  profile: Profile
  history: Session[]
  active: Session | null
  plan: Workout | null
  preferences?: UserPreferences
  routines?: Workout[]
}
