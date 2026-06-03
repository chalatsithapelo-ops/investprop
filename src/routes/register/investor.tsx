import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTRPC, useTRPCClient } from '~/trpc/react'

export const Route = createFileRoute('/register/investor')({
  component: InvestorRegisterPage,
})

function InvestorRegisterPage() {
  const navigate = useNavigate()
  const trpc = useTRPC()
  const trpcClient = useTRPCClient()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [companyName, setCompanyName] = useState('')
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
      await trpcClient.register.mutate({
        name,
        email,
        password,
        role: 'INVESTOR' as const,
        phone: phone || undefined,
        companyName: companyName || undefined,
      })
      toast.success('Investor registration successful! Please sign in.')
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
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block">
            <h1 className="text-3xl font-bold">
              <span className="text-gold-500">Prop</span>
              <span className="text-gray-900">Vest</span>
            </h1>
          </Link>
          <p className="mt-2 text-gray-500">Investor Registration</p>
          <p className="mt-1 text-sm text-gray-500">
            Create your investor account to start building your property portfolio
          </p>
        </div>

        {/* Register Card */}
        <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-gray-600">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-600">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
              />
            </div>

            <div>
              <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-gray-600">
                Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+27 XX XXX XXXX"
                className="w-full rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
              />
            </div>

            <div>
              <label htmlFor="companyName" className="mb-1.5 block text-sm font-medium text-gray-600">
                Company Name <span className="text-gray-500">(optional)</span>
              </label>
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your company (if applicable)"
                className="w-full rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-600">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
              />
              <p className="mt-1 text-xs text-gray-500">Must be at least 8 characters</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-gray-600">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gold-500 px-4 py-2.5 font-semibold text-white transition hover:bg-gold-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Creating investor account...' : 'Register as Investor'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-gold-500 transition hover:text-gold-600">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
