/** An error the user can fix. The CLI prints its message without a stack trace. */
export class UserError extends Error {
  readonly hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'UserError'
    this.hint = hint
  }
}

/** Formats any thrown value for terminal output. */
export const formatError = (error: unknown): string => {
  if (error instanceof UserError)
    return error.hint ? `${error.message}\n  ${error.hint}` : error.message
  if (error instanceof Error) return error.stack ?? error.message
  return String(error)
}
