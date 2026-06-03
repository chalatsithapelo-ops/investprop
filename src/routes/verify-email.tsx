import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Mail, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useTRPCClient } from '~/trpc/react'

export const Route = createFileRoute('/verify-email')({
  component: VerifyEmail,
})

function VerifyEmail() {
  const trpcClient = useTRPCClient()

  const searchParams = new URLSearchParams(window.location.search)
  const token = searchParams.get('token')

  const [verifying, setVerifying] = useState(true)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const verify = async () => {
    if (!token) {
      setError('No verification token provided.')
      setVerifying(false)
      return
    }

    setVerifying(true)
    setError(null)
    setSuccess(false)

    try {
      await trpcClient.verifyEmail.mutate({ token })
      setSuccess(true)
    } catch (err: any) {
      setError(err?.message || 'Email verification failed. The link may be invalid or expired.')
    } finally {
      setVerifying(false)
    }
  }

  useEffect(() => {
    verify()
  }, [token])

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Prop<span className="text-gold-500">Vest</span>
          </h1>
          <p className="text-gray-500 mt-2">Email Verification</p>
        </div>

        {/* Card */}
        <div className="bg-navy-900/50 border border-navy-800/50 rounded-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gold-50 rounded-lg">
              <Mail className="h-6 w-6 text-gold-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Verify Email</h2>
              <p className="text-sm text-gray-500">Confirming your email address</p>
            </div>
          </div>

          {/* Verifying */}
          {verifying && (
            <div className="text-center py-8">
              <Loader2 className="h-10 w-10 text-gold-500 animate-spin mx-auto" />
              <p className="text-gray-500 mt-4">Verifying your email...</p>
            </div>
          )}

          {/* Success */}
          {!verifying && success && (
            <div className="space-y-6">
              <div className="bg-emerald-50 text-emerald-600 border border-emerald-500/20 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle className="h-5 w-5 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Email verified!</p>
                  <p className="text-sm mt-1 text-emerald-600/80">
                    Your email has been confirmed. You can now log in to your account.
                  </p>
                </div>
              </div>

              <Link
                to="/login"
                className="block w-full py-2.5 bg-gold-500 hover:bg-gold-600 text-white font-semibold rounded-lg transition-colors text-center"
              >
                Go to Login
              </Link>
            </div>
          )}

          {/* Error */}
          {!verifying && error && (
            <div className="space-y-6">
              <div className="bg-red-50 text-red-600 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
                <XCircle className="h-5 w-5 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Verification failed</p>
                  <p className="text-sm mt-1 text-red-600/80">{error}</p>
                </div>
              </div>

              <button
                onClick={verify}
                className="w-full py-2.5 bg-gold-500 hover:bg-gold-600 text-white font-semibold rounded-lg transition-colors"
              >
                Retry Verification
              </button>

              <div className="text-center">
                <Link
                  to="/login"
                  className="text-sm text-gold-500 hover:text-gold-600 transition-colors"
                >
                  Back to Login
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
