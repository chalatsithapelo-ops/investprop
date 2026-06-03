import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Mail, ArrowLeft, CheckCircle, XCircle } from 'lucide-react'
import { useTRPCClient } from '~/trpc/react'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPassword,
})

function ForgotPassword() {
  const trpcClient = useTRPCClient()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      await trpcClient.requestPasswordReset.mutate({ email })
      setSuccess(true)
    } catch (err: any) {
      setError(err?.message || 'Failed to send reset link. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Prop<span className="text-gold-500">Vest</span>
          </h1>
          <p className="text-gray-500 mt-2">Reset your password</p>
        </div>

        {/* Card */}
        <div className="bg-navy-900/50 border border-navy-800/50 rounded-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gold-50 rounded-lg">
              <Mail className="h-6 w-6 text-gold-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Forgot Password</h2>
              <p className="text-sm text-gray-500">
                Enter your email and we'll send you a reset link
              </p>
            </div>
          </div>

          {/* Success Alert */}
          {success && (
            <div className="bg-emerald-50 text-emerald-600 border border-emerald-500/20 rounded-lg p-4 mb-6 flex items-start gap-3">
              <CheckCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Reset link sent!</p>
                <p className="text-sm mt-1 text-emerald-600/80">
                  Check your email for a password reset link. It may take a few minutes to arrive.
                </p>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="bg-red-50 text-red-600 border border-red-500/20 rounded-lg p-4 mb-6 flex items-start gap-3">
              <XCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {!success && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-600 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-navy-800/50 border border-navy-700 text-gray-900 placeholder-gray-500 rounded-lg focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-gold-500 hover:bg-gold-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm text-gold-500 hover:text-gold-600 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
