import { OAuth2Client } from 'google-auth-library';

type GoogleTokenPayload = {
  aud?: string | string[];
  email?: string;
  email_verified?: boolean;
  exp?: number;
  iss?: string;
  name?: string;
  sub?: string;
};

export class GoogleAuthError extends Error {
  constructor(
    public readonly code: 'GOOGLE_AUTH_NOT_CONFIGURED' | 'GOOGLE_TOKEN_INVALID',
    message: string
  ) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

export function parseVerifiedGoogleIdentity(
  payload: GoogleTokenPayload | undefined,
  expectedClientId: string,
  now = Date.now()
) {
  const audienceMatches =
    payload?.aud === expectedClientId ||
    (Array.isArray(payload?.aud) && payload.aud.includes(expectedClientId));

  if (
    !payload?.sub ||
    !payload.email ||
    payload.email_verified !== true ||
    !audienceMatches ||
    !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss || '') ||
    !payload.exp ||
    payload.exp * 1000 <= now
  ) {
    throw new GoogleAuthError('GOOGLE_TOKEN_INVALID', 'Google sign-in could not be verified. Please try again.');
  }

  return {
    email: payload.email.toLowerCase().trim(),
    name: payload.name?.trim() || null,
    subject: payload.sub,
  };
}

export async function verifyGoogleCredential(idToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new GoogleAuthError(
      'GOOGLE_AUTH_NOT_CONFIGURED',
      'Google sign-in is not configured yet. Please contact support.'
    );
  }

  try {
    const ticket = await new OAuth2Client(clientId).verifyIdToken({
      idToken,
      audience: clientId,
    });
    return parseVerifiedGoogleIdentity(ticket.getPayload(), clientId);
  } catch (error) {
    if (error instanceof GoogleAuthError) throw error;
    throw new GoogleAuthError('GOOGLE_TOKEN_INVALID', 'Google sign-in could not be verified. Please try again.');
  }
}
