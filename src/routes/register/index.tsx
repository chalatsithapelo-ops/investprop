import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTRPC, useTRPCClient } from '~/trpc/react'

export const Route = createFileRoute('/register/')({
  component: RegisterPage,
})

function RegisterPage() {
  const navigate = useNavigate()
  const trpc = useTRPC()
  const trpcClient = useTRPCClient()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState<'INVESTOR' | 'PROPERTY_OWNER'>('INVESTOR')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      toast.error('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      toast.error('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      await trpcClient.register.mutate({ name, email, password, role })
      toast.success('Registration successful! Please sign in.')
      navigate({ to: '/login' })
    } catch (err: any) {
      const message = err?.message || 'Registration failed. Please try again.'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block">
            <h1 className="text-3xl font-bold font-display">
              <span className="text-gold-600">Prop</span>
              <span className="text-gray-900">Vest</span>
            </h1>
          </Link>
          <p className="mt-2 text-sm text-gray-500">Create your investment account</p>
        </div>

        {/* Register Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
              />
            </div>

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

            <div>
              <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-gray-700">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Account Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('INVESTOR')}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                    role === 'INVESTOR'
                      ? 'border-gold-500 bg-gold-50 text-gold-600'
                      : 'border-gray-300 bg-gray-50 text-gray-500 hover:border-gray-400'
                  }`}
                >
                  Investor
                </button>
                <button
                  type="button"
                  onClick={() => setRole('PROPERTY_OWNER')}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                    role === 'PROPERTY_OWNER'
                      ? 'border-gold-500 bg-gold-50 text-gold-600'
                      : 'border-gray-300 bg-gray-50 text-gray-500 hover:border-gray-400'
                  }`}
                >
                  Property Owner
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gold-500 px-4 py-2.5 font-semibold text-white transition hover:bg-gold-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 space-y-3 text-center text-sm">
            <p className="text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-gold-600 transition hover:text-gold-500">
                Sign in
              </Link>
            </p>
            <p className="text-gray-500">
              Looking for dedicated investor registration?{' '}
              <Link to="/register/investor" className="font-medium text-gold-600 transition hover:text-gold-500">
                Register as Investor
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
