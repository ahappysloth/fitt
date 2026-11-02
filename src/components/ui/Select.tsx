'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import './controls.css'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  label: string
  value: string
  options: readonly SelectOption[]
  onValueChange: (value: string) => void
  id?: string
  name?: string
  disabled?: boolean
  required?: boolean
  className?: string
  describedBy?: string
  leadingIcon?: ReactNode
}

/** One styled select across the app, with Radix handling listbox navigation. */
export function Select({
  label,
  value,
  options,
  onValueChange,
  id,
  name,
  disabled,
  required,
  className = '',
  describedBy,
  leadingIcon,
}: SelectProps) {
  const trigger = useRef<HTMLButtonElement>(null)
  const tabTarget = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [container, setContainer] = useState<HTMLElement>()
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const changeOpen = (next: boolean) => {
    if (next) {
      // Native dialogs live above body portals in the browser's top layer.
      setContainer(trigger.current?.closest('dialog') ?? undefined)
      tabTarget.current = null
    }
    setOpen(next)
  }

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      open={open}
      onOpenChange={changeOpen}
      disabled={disabled}
      name={name}
      required={required}
    >
      <SelectPrimitive.Trigger
        ref={trigger}
        id={id}
        className={`ui-select ${className}`}
        aria-label={label}
        aria-describedby={describedBy}
      >
        {leadingIcon && (
          <span className="ui-select__leading-icon" aria-hidden="true">
            {leadingIcon}
          </span>
        )}
        <span className="ui-select__value">
          <SelectPrimitive.Value />
        </span>
        <SelectPrimitive.Icon className="ui-select__chevron">
          <ChevronDown size={16} aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={container}>
        <SelectPrimitive.Content
          className="ui-select-menu"
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          align="start"
          onEscapeKeyDown={(event) => {
            // Escape dismisses this menu before the enclosing native dialog.
            event.preventDefault()
            event.stopPropagation()
            changeOpen(false)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return
            event.preventDefault()
            const button = trigger.current
            if (!button) return
            const scope = button.closest('dialog') ?? document.body
            const controls = Array.from(
              scope.querySelectorAll<HTMLElement>(
                'a[href], button, input, select, textarea, [tabindex]',
              ),
            ).filter(
              (element) =>
                element.tabIndex >= 0 &&
                !element.matches(':disabled') &&
                !element.closest('[inert], .ui-select-menu') &&
                element.getClientRects().length > 0,
            )
            tabTarget.current =
              controls[controls.indexOf(button) + (event.shiftKey ? -1 : 1)] ?? button
            changeOpen(false)
          }}
          onCloseAutoFocus={(event) => {
            if (!tabTarget.current) return
            event.preventDefault()
            tabTarget.current.focus()
            tabTarget.current = null
          }}
        >
          <SelectPrimitive.ScrollUpButton className="ui-select-menu__scroll">
            <ChevronUp size={16} aria-hidden="true" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="ui-select-menu__viewport">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="ui-select-option"
                textValue={option.label}
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="ui-select-option__check">
                  <Check size={16} aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="ui-select-menu__scroll">
            <ChevronDown size={16} aria-hidden="true" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
