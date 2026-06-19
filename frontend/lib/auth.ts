const TOKEN_KEY = 'texmobile:auth_token'

export const AuthStore = {
  getToken: (): string | null => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(TOKEN_KEY)
  },
  setToken: (token: string): void => {
    localStorage.setItem(TOKEN_KEY, token)
  },
  clearToken: (): void => {
    localStorage.removeItem(TOKEN_KEY)
  },
}
