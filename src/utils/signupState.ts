export const SIGNUP_STATE_KEY = 'my-shows-signup-state'
export interface SignupState { email: string; verified: boolean }

export function readSignupState(): SignupState | null {
  try {
    const value = JSON.parse(localStorage.getItem(SIGNUP_STATE_KEY) ?? 'null')
    return value && typeof value.email === 'string' && typeof value.verified === 'boolean' ? value : null
  } catch { return null }
}

export function saveSignupState(state: SignupState | null) {
  try {
    if (state) localStorage.setItem(SIGNUP_STATE_KEY, JSON.stringify(state))
    else localStorage.removeItem(SIGNUP_STATE_KEY)
  } catch { /* Cross-tab updates are optional when storage is unavailable. */ }
}
