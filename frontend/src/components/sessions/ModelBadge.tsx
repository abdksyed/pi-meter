import { cn } from '../../lib/cn'
import styles from './ModelBadge.module.css'

const TONES = ['user', 'assistant', 'tool', 'system', 'success', 'neutral'] as const
type Tone = (typeof TONES)[number]

function toneFor(model: string): Tone {
  let hash = 0
  for (let index = 0; index < model.length; index += 1) {
    hash = (hash * 33 + model.charCodeAt(index)) | 0
  }
  return TONES[Math.abs(hash) % TONES.length]
}

export type ModelBadgeProps = {
  model: string
  extraCount?: number
  title?: string
  className?: string
}

export function ModelBadge({ model, extraCount = 0, title, className }: ModelBadgeProps) {
  return (
    <span
      className={cn(styles.badge, className)}
      data-tone={toneFor(model)}
      title={title ?? model}
    >
      {model}
      {extraCount > 0 ? ` +${extraCount}` : ''}
    </span>
  )
}
