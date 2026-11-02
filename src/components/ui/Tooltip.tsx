'use client'

import { useRef, useState, type ReactElement } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import './controls.css'

type TriggerProps = { disabled?: boolean; 'aria-label'?: string }

/** Hover and keyboard help that stays inside the active dialog's top layer. */
export function Tooltip({
  content,
  children,
}: {
  content: string
  children: ReactElement<TriggerProps>
}) {
  const trigger = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [container, setContainer] = useState<HTMLElement>()
  const disabled = children.props.disabled
  return (
    <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={150}>
      <TooltipPrimitive.Root
        open={open}
        onOpenChange={(next) => {
          if (next) setContainer(trigger.current?.closest('dialog') ?? undefined)
          setOpen(next)
        }}
      >
        <TooltipPrimitive.Trigger
          asChild
          ref={(node) => {
            trigger.current = node
          }}
        >
          {disabled ? (
            <span
              className="ui-tooltip-disabled-trigger"
              tabIndex={0}
              role="group"
              aria-disabled="true"
              aria-label={children.props['aria-label'] ?? content}
            >
              {children}
            </span>
          ) : (
            children
          )}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal container={container}>
          <TooltipPrimitive.Content
            className="ui-tooltip"
            sideOffset={8}
            collisionPadding={12}
            onEscapeKeyDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setOpen(false)
            }}
          >
            {content}
            <TooltipPrimitive.Arrow className="ui-tooltip__arrow" width={10} height={5} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
