import type { SendEmailOptions } from '@turnal-io/email'
import { createElement } from 'react'
import type { FittEnv } from './env'
import { isWorkerRuntime } from './runtime'

export type SendEmail = (options: SendEmailOptions) => Promise<void>

export function emailIsConfigured(env: FittEnv) {
  return (
    !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.EMAIL_FROM) &&
    !/[\r\n\0]/.test(env.EMAIL_FROM + env.SMTP_HOST)
  )
}

export function emailDeliveryAvailable(env: FittEnv) {
  // An HTTP-only managed proxy does not authorize public SMTP. Local Node
  // without that proxy and the deployed Worker use the actual SMTP transport.
  return (
    emailIsConfigured(env) &&
    (isWorkerRuntime()
      ? typeof env.__FITT_SEND_EMAIL === 'function'
      : !(process.env.HTTPS_PROXY || process.env.HTTP_PROXY))
  )
}

export function safeEmailOptions(options: SendEmailOptions) {
  const values = [options.subject, ...[options.to].flat()]
  if (values.some((value) => /[\r\n\0]/.test(value))) throw new Error('Invalid email header')
  return options
}

export async function boundedDelivery(deliver: () => Promise<void>, timeoutMs = 15_000) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      deliver(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Email delivery timed out')), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}

export function createMailSender(env: FittEnv): SendEmail {
  return async (options) => {
    if (!emailDeliveryAvailable(env)) throw new Error('Email delivery is unavailable')
    const safe = safeEmailOptions(options)
    try {
      if (isWorkerRuntime()) {
        // Keep cloudflare:sockets outside Next's Node server bundle. The custom
        // Worker entry injects this adapter before OpenNext handles the request.
        const sender = env.__FITT_SEND_EMAIL
        if (!sender) throw new Error('Worker email delivery is unavailable')
        await boundedDelivery(() => sender(safe))
      } else {
        const { default: nodemailer } = await import('nodemailer')
        const { createSendEmail } = await import('@turnal-io/email')
        const transport = nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: 465,
          secure: true,
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
          connectionTimeout: 8_000,
          greetingTimeout: 8_000,
          socketTimeout: 12_000,
        })
        try {
          await boundedDelivery(() => createSendEmail({ transport, from: env.EMAIL_FROM })(safe))
        } finally {
          transport.close()
        }
      }
    } catch {
      // Provider errors can contain recipient addresses or auth details.
      throw new Error('Email delivery could not be completed')
    }
  }
}

export function magicLinkEmail({ url }: { url: string }) {
  return createElement(
    'html',
    null,
    createElement(
      'body',
      {
        style: {
          fontFamily: 'Arial, sans-serif',
          color: '#ededeb',
          backgroundColor: '#111210',
          padding: '32px',
        },
      },
      createElement('h1', { style: { fontSize: '28px' } }, 'Your next chapter starts here.'),
      createElement('p', null, 'Use this link to sign in to Fitt and keep your progress with you.'),
      createElement(
        'a',
        {
          href: url,
          style: {
            display: 'inline-block',
            padding: '14px 22px',
            backgroundColor: '#c5ff3a',
            color: '#111210',
            borderRadius: '12px',
            fontWeight: 'bold',
          },
        },
        'Sign in to Fitt',
      ),
      createElement(
        'p',
        null,
        'This link expires shortly and can only be used once. If you didn’t request it, you can ignore this email.',
      ),
    ),
  )
}
