import { createSendEmail, createWorkerMailerTransport } from '@turnal-io/email/workerd'
import type { SendEmail } from './email'
import type { FittEnv } from './env'

type WorkerEmailEnv = Partial<Pick<FittEnv, 'SMTP_HOST' | 'SMTP_USER' | 'SMTP_PASS' | 'EMAIL_FROM'>>

/**
 * Import only from the custom Worker entry. Wrangler resolves the ESM SMTP
 * implementation and its cloudflare:sockets builtin; Next's server bundler
 * never needs to resolve a Workers-only module. No connection opens here.
 */
export function createWorkerMailSender(env: WorkerEmailEnv): SendEmail | undefined {
  if (!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.EMAIL_FROM)) return
  const transport = createWorkerMailerTransport({
    host: env.SMTP_HOST,
    port: 465,
    secure: true,
    startTls: false,
    heloHost: 'fitt.invalid',
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  })
  return createSendEmail({ transport, from: env.EMAIL_FROM })
}
