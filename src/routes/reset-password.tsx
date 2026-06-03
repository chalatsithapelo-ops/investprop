import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Lock, CheckCircle, XCircle, ArrowLeft } from 'lucide-react'
import { useTRPCClient } from '~/trpc/react'

export const Route = createFileRoute('/reset-password')({
  component: ResetPassword,
})

function ResetPassword() {
  const trpcClient = useTRPCClient()
  const navigate = useNavigate()

  const searchParams = new URLSearchParams(window.location.search)
  const token = searchParams.get('token')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setValidating(false)
      setError('No reset token provided. Please request a new password reset link.')
      return
    }

    const validateToken = async () => {
      try {
        await trpcClient.validateResetToken.query({ token })
        setTokenValid(true)
      } catch (err: any) {
        setError(err?.message || 'This reset link is invalid or has expired.')
      } finally {
        setValidating(false)
      }
    }

    validateToken()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await trpcClient.resetPassword.mutate({ token: token!, newPassword })
      setSuccess(true)
      setTimeout(() => {
        navigate({ to: '/login' })
      }, 2000)
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password. Please try again.')
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
          <p className="text-gray-500 mt-2">Set a new password</p>
        </div>

        {/* Card */}
        <div className="bg-navy-900/50 border border-navy-800/50 rounded-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gold-50 rounded-lg">
              <Lock className="h-6 w-6 text-gold-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Reset Password</h2>
              <p className="text-sm text-gray-500">Enter your new password below</p>
            </div>
          </div>

          {/* Validating */}
          {validating && (
            <div className="text-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-gold-500 border-t-transparent rounded-full mx-auto" />
              <p className="text-gray-500 mt-4">Validating reset link...</p>
            </div>
          )}

          {/* Success Alert */}
          {success && (
            <div className="bg-emerald-50 text-emerald-600 border border-emerald-500/20 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Password reset successfully!</p>
                <p className="text-sm mt-1 text-emerald-600/80">
                  Redirecting you to login...
                </p>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {!validating && error && (
            <div className="bg-red-50 text-red-600 border border-red-500/20 rounded-lg p-4 mb-6 flex items-start gap-3">
              <XCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Form */}
          {!validating && tokenValid && !success && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-600 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                  <input
                    id="newPassword"
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full pl-10 pr-4 py-2.5 bg-navy-800/50 border border-navy-700 text-gray-900 placeholder-gray-500 rounded-lg focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-600 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full pl-10 pr-4 py-2.5 bg-navy-800/50 border border-navy-700 text-gray-900 placeholder-gray-500 rounded-lg focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-gold-500 hover:bg-gold-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
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
