import { describe, expect, it, vi } from 'vitest'
import { createDb } from '@turnal-io/db/serverless'
import { buildRequestAuth, discardProviderTokens } from './auth'
import {
  boundedDelivery,
  createMailSender,
  emailDeliveryAvailable,
  safeEmailOptions,
} from './email'
import type { FittEnv } from './env'
import * as schema from '../db/schema'
import { createElement } from 'react'

const env = {
  DATABASE_URL: 'postgresql://fixture:fixture@invalid.example/test',
  BETTER_AUTH_SECRET: 'test-only-secret-with-at-least-thirty-two-characters',
  BETTER_AUTH_URL: 'https://fitt.example',
  TRUSTED_ORIGINS: 'https://fitt.example',
  GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'fixture',
  SMTP_HOST: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  EMAIL_FROM: '',
} satisfies FittEnv

describe('passwordless authentication', () => {
  it('retains provider identity while discarding unneeded Google credentials', async () => {
    const input = {
      userId: 'user',
      providerId: 'google',
      accountId: 'identity',
      accessToken: 'access',
      refreshToken: 'refresh',
      idToken: 'id',
    }
    const { data } = await discardProviderTokens(input)
    expect(data).toMatchObject({
      userId: 'user',
      providerId: 'google',
      accountId: 'identity',
      accessToken: null,
      refreshToken: null,
      idToken: null,
    })
    expect(input.accessToken).toBe('access')
  })

  it('does not hide a failed mail send behind Turnal’s successful dispatch response', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, pool } = createDb({ schema, connectionString: env.DATABASE_URL })
    const background: Promise<unknown>[] = []
    const sender = vi.fn(async () => {
      throw new Error('delivery failed')
    })
    try {
      const built = buildRequestAuth(
        db,
        env,
        (task) => {
          background.push(task)
        },
        sender,
      )
      const plugin = built.auth.options.plugins?.find((value) => value.id === 'magic-link')
      const options = plugin?.options as {
        sendMagicLink: (options: { email: string; url: string }) => Promise<void>
      }
      await options.sendMagicLink({
        email: 'athlete@example.test',
        url: 'https://fitt.example/api/auth/magic-link/verify?token=fixture',
      })
      await expect(built.finishEmailDeliveries()).rejects.toThrow('delivery failed')
      await Promise.allSettled(background)
      expect(sender).toHaveBeenCalledOnce()
    } finally {
      await pool.end()
      output.mockRestore()
    }
  })

  it('rejects header injection and bounds hanging mail delivery', async () => {
    expect(() =>
      safeEmailOptions({
        to: 'a@example.test\r\nBcc: another@example.test',
        subject: 'Sign in',
        react: createElement('p'),
      }),
    ).toThrow('Invalid email header')
    await expect(boundedDelivery(() => new Promise(() => {}), 5)).rejects.toThrow('timed out')
  })

  it('uses the request-local Worker sender and fails closed when it is missing', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' })
    const configured = {
      ...env,
      SMTP_HOST: 'smtp.example.test',
      SMTP_USER: 'fixture',
      SMTP_PASS: 'fixture',
      EMAIL_FROM: 'Fitt <fitt@example.test>',
    }
    const options = {
      to: 'athlete@example.test',
      subject: 'Sign in',
      react: createElement('p', null, 'Fitt'),
    }
    try {
      expect(emailDeliveryAvailable(configured)).toBe(false)
      await expect(createMailSender(configured)(options)).rejects.toThrow('unavailable')
      const sender = vi.fn(async () => {})
      const injected = { ...configured, __FITT_SEND_EMAIL: sender }
      expect(emailDeliveryAvailable(injected)).toBe(true)
      await createMailSender(injected)(options)
      expect(sender).toHaveBeenCalledWith(options)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not expose raw adapter errors or query credentials in responses or logs', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, pool } = createDb({ schema, connectionString: env.DATABASE_URL })
    const insert = vi.spyOn(db, 'insert').mockImplementation(() => {
      throw new Error('fixture-sensitive-query-parameter')
    })
    try {
      const built = buildRequestAuth(db, env, undefined, async () => {})
      const response = await built.auth.handler(
        new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-in/magic-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: env.BETTER_AUTH_URL },
          body: JSON.stringify({ email: 'athlete@example.test', callbackURL: '/' }),
        }),
      )
      expect(response.status).toBe(500)
      expect(await response.text()).not.toContain('fixture-sensitive-query-parameter')
      expect(
        output.mock.calls
          .flat()
          .some((value) => String(value).includes('fixture-sensitive-query-parameter')),
      ).toBe(false)
    } finally {
      insert.mockRestore()
      await pool.end()
      output.mockRestore()
    }
  })
})
