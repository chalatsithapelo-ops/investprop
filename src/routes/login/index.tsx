import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTRPC, useTRPCClient } from '~/trpc/react'
import { useAuthStore } from '~/stores/authStore'

export const Route = createFileRoute('/login/')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const trpc = useTRPC()
  const trpcClient = useTRPCClient()
  const { setAuth } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await trpcClient.login.mutate({ email, password })
      setAuth(result.accessToken, result.refreshToken, result.user as any)
      toast.success('Login successful!')
      navigate({ to: '/dashboard' })
    } catch (err: any) {
      const message = err?.message || 'Login failed. Please try again.'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block">
            <h1 className="text-3xl font-bold font-display">
              <span className="text-gold-600">Invest</span>
              <span className="text-gray-900">prop</span>
            </h1>
          </Link>
          <p className="mt-2 text-sm text-gray-500">Secure property investment platform</p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
              />
            </div>

            <div className="flex items-center justify-end">
              <Link
                to="/forgot-password"
                className="text-sm text-gold-600 transition hover:text-gold-500"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-gold-500 to-gold-600 px-4 py-2.5 font-semibold text-white shadow-lg shadow-gold-500/15 transition hover:from-gold-400 hover:to-gold-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-gold-600 transition hover:text-gold-500">
              Create one
            </Link>
          </p>
        </div>

        {/* Demo Accounts */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
          <h3 className="mb-1 text-center text-sm font-semibold text-gray-700">
            Demo Accounts
          </h3>
          <p className="mb-4 text-center text-xs text-gray-400">
            Password for all: <span className="font-mono font-bold text-gold-600">password123</span>
          </p>

          <div className="space-y-2">
            {[
              { email: 'investor@demo.com', role: 'Investor', color: 'bg-emerald-100 text-emerald-700' },
              { email: 'investor2@demo.com', role: 'Investor', color: 'bg-emerald-100 text-emerald-700' },
              { email: 'investor3@demo.com', role: 'Investor', color: 'bg-emerald-100 text-emerald-700' },
              { email: 'pm@demo.com', role: 'Project Manager', color: 'bg-purple-100 text-purple-700' },
              { email: 'owner@demo.com', role: 'Property Owner', color: 'bg-amber-100 text-amber-700' },
              { email: 'contractor@demo.com', role: 'Contractor', color: 'bg-gray-100 text-gray-700' },
            ].map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email)
                  setPassword('password123')
                }}
                className="flex w-full items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-left transition hover:border-gold-300 hover:bg-gold-50"
              >
                <span className="text-sm text-gray-700">{account.email}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${account.color}`}>
                  {account.role}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
