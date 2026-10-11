import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Mail, Shield, ArrowLeft, RefreshCw, Check, AlertCircle,
  Sparkles, Zap, Lock, Eye, Star, ChevronRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
        };
      };
    };
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const masked =
    local.length > 2
      ? local[0] + '*'.repeat(Math.min(local.length - 2, 7)) + local[local.length - 1]
      : local[0] + '*';
  return `${masked}@${domain}`;
}

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// ─────────────────────────────────────────────
// OTP Input Component
// ─────────────────────────────────────────────
function OTPInput({
  value,
  onChange,
  disabled,
  hasError,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  hasError?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null));

  const handleChange = (idx: number, raw: string) => {
    // Support paste: spread digits across fields
    const digits = raw.replace(/\D/g, '').slice(0, 6 - idx);
    if (digits.length > 1) {
      const next = [...value];
      for (let i = 0; i < digits.length; i++) {
        if (idx + i < 6) next[idx + i] = digits[i];
      }
      onChange(next);
      const focusIdx = Math.min(idx + digits.length, 5);
      refs.current[focusIdx]?.focus();
      return;
    }
    const next = [...value];
    next[idx] = raw.replace(/\D/g, '');
    onChange(next);
    if (raw && idx < 5) refs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && idx > 0) refs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < 5) refs.current[idx + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      const next = [...value];
      pasted.split('').forEach((d, i) => { if (i < 6) next[i] = d; });
      onChange(next);
      const focusIdx = Math.min(pasted.length, 5);
      refs.current[focusIdx]?.focus();
    }
  };

  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          id={`otp-digit-${i}`}
          aria-label={`Digit ${i + 1} of 6`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6} // allows paste
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          style={{
            width: 48,
            height: 58,
            textAlign: 'center',
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 0,
            background: hasError
              ? 'rgba(239,68,68,0.06)'
              : digit
              ? 'rgba(139,92,246,0.08)'
              : 'rgba(255,255,255,0.03)',
            border: `2px solid ${
              hasError
                ? 'rgba(239,68,68,0.5)'
                : digit
                ? 'rgba(139,92,246,0.7)'
                : 'rgba(255,255,255,0.1)'
            }`,
            borderRadius: 12,
            color: 'var(--text-1, #f1f5f9)',
            outline: 'none',
            transition: 'border-color 0.2s, background 0.2s, transform 0.1s',
            transform: digit ? 'scale(1.05)' : 'scale(1)',
            cursor: disabled ? 'not-allowed' : 'text',
            fontFamily: 'monospace',
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Feature highlights for left panel
// ─────────────────────────────────────────────
const features = [
  { icon: <Shield size={15} />, text: 'No password required' },
  { icon: <Lock size={15} />, text: 'Bank-grade security' },
  { icon: <Zap size={15} />, text: 'Instant access' },
  { icon: <Star size={15} />, text: 'One-click sign in' },
];

// ─────────────────────────────────────────────
// Main AuthModal
// ─────────────────────────────────────────────
type Phase = 'email' | 'otp' | 'success';

interface ErrorState {
  message: string;
  code?: string;
}

export default function AuthModal() {
  const { authView, setAuthView, signInWithGoogle, sendOtp, verifyOtp, resendOtp } = useApp();

  const [phase, setPhase] = useState<Phase>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<ErrorState | null>(null);
  const [googleErr, setGoogleErr] = useState<ErrorState | null>(null);
  const [googleSetupMessage, setGoogleSetupMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [successUser, setSuccessUser] = useState<{ email: string; isNewUser: boolean } | null>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  // Reset when modal opens/closes
  useEffect(() => {
    if (authView) {
      setPhase('email');
      setEmail('');
      setOtp(['', '', '', '', '', '']);
      setErr(null);
      setGoogleErr(null);
      setLoading(false);
      setCountdown(0);
    }
  }, [authView]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  useEffect(() => {
    const button = googleButtonRef.current;
    if (!authView || phase !== 'email' || !button) return;

    button.replaceChildren();
    setGoogleSetupMessage(null);
    if (!googleClientId) {
      setGoogleSetupMessage('Google Sign-In needs to be configured for this deployment.');
      return;
    }

    let cancelled = false;
    const renderGoogleButton = () => {
      if (cancelled || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: ({ credential }) => {
          if (!credential) {
            setGoogleErr({ message: 'Google sign-in was cancelled or could not be completed.' });
            return;
          }
          setLoading(true);
          setGoogleErr(null);
          void signInWithGoogle(credential)
            .catch((error: any) => {
              setGoogleErr({ message: error?.message || 'Google sign-in failed. Please try again.' });
            })
            .finally(() => setLoading(false));
        },
      });
      window.google.accounts.id.renderButton(button, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: Math.min(320, Math.floor(button.clientWidth || 320)),
      });
    };

    let script = document.getElementById('google-identity-services') as HTMLScriptElement | null;
    const handleScriptError = () => {
      if (!cancelled) setGoogleSetupMessage('Google Sign-In could not load. Check your connection and try again.');
    };

    if (window.google) {
      renderGoogleButton();
    } else {
      if (!script) {
        script = document.createElement('script');
        script.id = 'google-identity-services';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
      }
      script.addEventListener('load', renderGoogleButton, { once: true });
      script.addEventListener('error', handleScriptError, { once: true });
      if (!script.isConnected) document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      script?.removeEventListener('load', renderGoogleButton);
      script?.removeEventListener('error', handleScriptError);
      button.replaceChildren();
    };
  }, [authView, googleClientId, phase, signInWithGoogle]);

  const close = useCallback(() => {
    setAuthView(null);
  }, [setAuthView]);

  // ─── Send OTP ─────────────────────────────
  const handleSendOtp = async () => {
    if (!isValidEmail(email)) {
      setErr({ message: 'Please enter a valid email address.' });
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      await sendOtp(email);
      setPhase('otp');
      setCountdown(60);
    } catch (e: any) {
      const code = e?.code || '';
      if (code === 'SMTP_NOT_CONFIGURED') {
        setErr({ message: 'Email service is not configured. Please contact support.', code });
      } else if (code === 'SMTP_DELIVERY_FAILED') {
        setErr({ message: "We couldn't send the verification email. Please try again.", code });
      } else if (e?.status === 429) {
        setErr({ message: e?.message || 'Too many requests. Please wait before trying again.', code: e?.code || 'TOO_MANY_REQUESTS' });
      } else {
        setErr({ message: e?.message || 'Connection problem. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Verify OTP ───────────────────────────
  const handleVerifyOtp = async () => {
    const code = otp.join('');
    if (code.length < 6) {
      setErr({ message: 'Please enter the complete 6-digit code.' });
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const result = await verifyOtp(email, code);
      if (result.success) {
        setSuccessUser({ email, isNewUser: result.isNewUser });
        setPhase('success');
        setTimeout(close, 2200);
      }
    } catch (e: any) {
      const errCode = e?.code || '';
      if (errCode === 'OTP_INVALID') {
        setErr({ message: 'That code is incorrect. Please try again.', code: errCode });
        setOtp(['', '', '', '', '', '']);
      } else if (errCode === 'OTP_EXPIRED') {
        setErr({ message: 'This verification code has expired. Request a new code.', code: errCode });
        setOtp(['', '', '', '', '', '']);
      } else if (errCode === 'OTP_MAX_ATTEMPTS') {
        setErr({ message: 'Too many verification attempts. Request a new code.', code: errCode });
        setOtp(['', '', '', '', '', '']);
      } else if (e?.status === 429) {
        setErr({ message: 'Too many requests. Please wait before trying again.' });
      } else {
        setErr({ message: e?.message || 'Connection problem. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Resend OTP ───────────────────────────
  const handleResend = async () => {
    if (countdown > 0) return;
    setLoading(true);
    setErr(null);
    setOtp(['', '', '', '', '', '']);
    try {
      await resendOtp(email);
      setCountdown(60);
    } catch (e: any) {
      if (e?.code === 'RESEND_COOLDOWN' || e?.code === 'OTP_RATE_LIMIT') {
        setErr({ message: e.message });
      } else {
        setErr({ message: "We couldn't resend the code. Please try again." });
      }
    } finally {
      setLoading(false);
    }
  };

  if (!authView) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to Project Content AI Marketplace"
      className="modal-backdrop"
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 900,
          maxHeight: '95vh',
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.15)',
          background: '#0d0d1a',
        }}
        className="auth-modal-grid"
      >
        {/* ─── LEFT PANEL ─────────────────────────── */}
        <div
          style={{
            background: 'linear-gradient(145deg, #1a0533 0%, #0d1a3a 50%, #0a1628 100%)',
            padding: '48px 40px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Background orbs */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -60, left: -60, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%)', filter: 'blur(20px)' }} />
            <div style={{ position: 'absolute', bottom: -40, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.2) 0%, transparent 70%)', filter: 'blur(20px)' }} />
          </div>

          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Sparkles size={18} color="white" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2 }}>Project Content</div>
                <div style={{ fontSize: 11, color: 'rgba(139,92,246,0.9)', fontWeight: 600, letterSpacing: 1 }}>AI MARKETPLACE</div>
              </div>
            </div>

            {/* Headline */}
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.2, marginBottom: 14 }}>
              The future of AI content is{' '}
              <span style={{ background: 'linear-gradient(90deg, #8b5cf6, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                here
              </span>
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(241,245,249,0.6)', lineHeight: 1.6, marginBottom: 36 }}>
              Discover, create, and trade AI-powered content. Join thousands of creators and businesses on the marketplace.
            </p>

            {/* Feature list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {features.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa', flexShrink: 0 }}>
                    {f.icon}
                  </div>
                  <span style={{ fontSize: 13, color: 'rgba(241,245,249,0.7)' }}>{f.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom stats */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 24, marginTop: 40 }}>
            {[['24K+', 'Creators'], ['180K+', 'Products'], ['99.9%', 'Uptime']].map(([val, label]) => (
              <div key={label}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>{val}</div>
                <div style={{ fontSize: 11, color: 'rgba(241,245,249,0.4)', marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── RIGHT PANEL ────────────────────────── */}
        <div style={{ background: '#0f0f1e', padding: '48px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
          {/* Close button */}
          <button
            aria-label="Close sign in dialog"
            onClick={close}
            style={{ position: 'absolute', top: 20, right: 20, width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(241,245,249,0.5)', transition: 'all 0.2s' }}
          >
            <X size={14} />
          </button>

          {/* ─ PHASE: EMAIL ─ */}
          {phase === 'email' && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>Welcome</h2>
                <p style={{ fontSize: 14, color: 'rgba(241,245,249,0.5)' }}>Sign in securely with Google or email — no password needed.</p>
              </div>

              {googleClientId ? (
                <div
                  ref={googleButtonRef}
                  aria-label="Continue with Google"
                  style={{ display: 'flex', justifyContent: 'center', minHeight: 44, marginBottom: 8 }}
                />
              ) : (
                <button
                  type="button"
                  aria-label="Continue with Google — configuration required"
                  disabled
                  style={{
                    width: '100%',
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    marginBottom: 8,
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.22)',
                    background: '#fff',
                    color: '#3c4043',
                    fontSize: 14,
                    fontWeight: 600,
                    opacity: 0.75,
                    cursor: 'not-allowed',
                  }}
                >
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
                    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.7-.4-4H24v7.6h11c-.5 2.4-1.9 4.4-4.1 5.8v5h6.7c3.9-3.6 6-8.5 6-14.4z" />
                    <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5c-1.9 1.3-4.2 2.1-6.8 2.1-5.2 0-9.6-3.5-11.2-8.2h-6.9v5.2C9.3 39.6 16.2 44 24 44z" />
                    <path fill="#FBBC05" d="M12.8 28c-.4-1.2-.7-2.6-.7-4s.3-2.8.7-4v-5.2h-6.9C4.5 17.7 3.7 20.8 3.7 24s.8 6.3 2.2 9.2l6.9-5.2z" />
                    <path fill="#EA4335" d="M24 11.8c3 0 5.7 1 7.8 3l5.9-5.9C34.1 5.6 29.5 4 24 4 16.2 4 9.3 8.4 5.9 14.8l6.9 5.2c1.6-4.7 6-8.2 11.2-8.2z" />
                  </svg>
                  Continue with Google
                </button>
              )}
              {googleSetupMessage && (
                <p role="status" style={{ fontSize: 12, color: 'rgba(241,245,249,0.5)', textAlign: 'center', margin: '0 0 16px' }}>
                  {googleSetupMessage}
                </p>
              )}
              {googleErr && (
                <div
                  role="alert"
                  style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, marginBottom: 12 }}
                >
                  <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 13, color: '#ef4444', lineHeight: 1.4 }}>{googleErr.message}</span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0 20px', color: 'rgba(241,245,249,0.35)', fontSize: 12 }}>
                <span style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.1)' }} />
                Or continue with email
                <span style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.1)' }} />
              </div>

              {err && (
                <div
                  role="alert"
                  style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, marginBottom: 16 }}
                >
                  <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 13, color: '#ef4444', lineHeight: 1.4 }}>{err.message}</span>
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label htmlFor="auth-email" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(241,245,249,0.7)', marginBottom: 7 }}>
                  Email address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(139,92,246,0.7)' }} />
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErr(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '13px 14px 13px 42px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1.5px solid rgba(255,255,255,0.09)',
                      borderRadius: 10,
                      color: '#f1f5f9',
                      fontSize: 14,
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = 'rgba(139,92,246,0.5)')}
                    onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.09)')}
                  />
                </div>
              </div>

              <button
                id="send-otp-btn"
                onClick={handleSendOtp}
                disabled={loading || !email}
                style={{
                  width: '100%',
                  padding: '13px 20px',
                  background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                  border: 'none',
                  borderRadius: 10,
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loading || !email ? 'not-allowed' : 'pointer',
                  opacity: loading || !email ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'opacity 0.2s, transform 0.1s',
                  marginBottom: 20,
                }}
              >
                {loading ? (
                  <>
                    <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Sending code...
                  </>
                ) : (
                  <>
                    <Mail size={14} />
                    Send Verification Code
                  </>
                )}
              </button>

              <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(241,245,249,0.4)', marginBottom: 28 }}>
                Don't have an account?{' '}
                <span style={{ color: '#a78bfa', fontWeight: 600, cursor: 'pointer' }} onClick={handleSendOtp}>
                  Create account
                </span>
              </p>

              {/* Security notice */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.1)', borderRadius: 8 }}>
                <Shield size={13} color="#a78bfa" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: 'rgba(241,245,249,0.4)', lineHeight: 1.5, margin: 0 }}>
                  We'll send a secure 6-digit code to verify your identity. Your credentials are never stored.
                </p>
              </div>

              {/* Privacy links */}
              <div style={{ display: 'flex', gap: 16, marginTop: 20, justifyContent: 'center' }}>
                {['Privacy Policy', 'Terms of Service', 'Security'].map((link) => (
                  <a key={link} href="#" style={{ fontSize: 11, color: 'rgba(241,245,249,0.3)', textDecoration: 'none' }}>
                    {link}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ─ PHASE: OTP ─ */}
          {phase === 'otp' && (
            <div>
              {err && (
                <div
                  role="alert"
                  style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, marginBottom: 20 }}
                >
                  <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 13, color: '#ef4444', lineHeight: 1.4 }}>{err.message}</span>
                </div>
              )}
              <button
                onClick={() => { setPhase('email'); setErr(null); setOtp(['', '', '', '', '', '']); }}
                aria-label="Back to email input"
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(241,245,249,0.4)', fontSize: 13, marginBottom: 24, padding: 0 }}
              >
                <ArrowLeft size={13} /> Back
              </button>

              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <Mail size={22} color="#a78bfa" />
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>
                  Verification code sent
                </h2>
                <p style={{ fontSize: 14, color: 'rgba(241,245,249,0.5)', lineHeight: 1.5 }}>
                  We sent a 6-digit code to{' '}
                  <strong style={{ color: '#a78bfa' }}>{maskEmail(email)}</strong>
                </p>
              </div>

              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(241,245,249,0.5)', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', marginBottom: 14 }}>
                  Enter verification code
                </p>
                <OTPInput
                  value={otp}
                  onChange={(v) => { setOtp(v); setErr(null); }}
                  disabled={loading}
                  hasError={!!err}
                />
              </div>

              <button
                id="verify-otp-btn"
                onClick={handleVerifyOtp}
                disabled={loading || otp.join('').length < 6}
                style={{
                  width: '100%',
                  padding: '13px 20px',
                  background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                  border: 'none',
                  borderRadius: 10,
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loading || otp.join('').length < 6 ? 'not-allowed' : 'pointer',
                  opacity: loading || otp.join('').length < 6 ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'opacity 0.2s',
                  marginBottom: 20,
                }}
              >
                {loading ? (
                  <>
                    <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Shield size={14} />
                    Verify &amp; Continue
                    <ChevronRight size={14} />
                  </>
                )}
              </button>

              {/* Resend section */}
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'rgba(241,245,249,0.4)', marginBottom: 6 }}>
                  Didn't receive the code?
                </p>
                {countdown > 0 ? (
                  <p style={{ fontSize: 13, color: 'rgba(241,245,249,0.35)' }}>
                    Resend available in{' '}
                    <span style={{ color: '#a78bfa', fontWeight: 600 }}>{countdown}s</span>
                  </p>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={loading}
                    style={{ background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, color: '#a78bfa', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <RefreshCw size={12} />
                    Resend code
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ─ PHASE: SUCCESS ─ */}
          {phase === 'success' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div
                style={{
                  width: 70,
                  height: 70,
                  borderRadius: '50%',
                  background: 'rgba(16,185,129,0.12)',
                  border: '2px solid rgba(16,185,129,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                  animation: 'pulse-glow 1.5s ease-in-out infinite',
                }}
              >
                <Check size={32} color="#10b981" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>
                {successUser?.isNewUser ? 'Welcome aboard! 🎉' : 'Welcome back! ✨'}
              </h2>
              <p style={{ fontSize: 14, color: 'rgba(241,245,249,0.5)', marginBottom: 6 }}>
                {successUser?.isNewUser
                  ? 'Your account has been created and verified.'
                  : 'You have been securely signed in.'}
              </p>
              <p style={{ fontSize: 13, color: 'rgba(139,92,246,0.8)' }}>
                Redirecting to marketplace...
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.2); }
          50% { box-shadow: 0 0 0 12px rgba(16,185,129,0); }
        }
        @media (max-width: 680px) {
          .auth-modal-grid {
            grid-template-columns: 1fr !important;
            max-width: 420px !important;
          }
          .auth-modal-grid > div:first-child {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
