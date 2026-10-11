import assert from 'node:assert/strict';
import test from 'node:test';
import { GoogleAuthError, parseVerifiedGoogleIdentity, verifyGoogleCredential } from '../services/googleIdentityService.js';

const clientId = 'test-client.apps.googleusercontent.com';
const validPayload = {
  aud: clientId,
  email: 'Creator@example.com',
  email_verified: true,
  exp: 2_000,
  iss: 'https://accounts.google.com',
  name: 'Creator',
  sub: 'google-subject',
};

test('accepts a verified Google identity and normalizes the email', () => {
  assert.deepEqual(parseVerifiedGoogleIdentity(validPayload, clientId, 1_000_000), {
    email: 'creator@example.com',
    name: 'Creator',
    subject: 'google-subject',
  });
});

test('rejects unverified email, wrong audience, wrong issuer, and expired credentials', () => {
  const invalidPayloads = [
    { ...validPayload, email_verified: false },
    { ...validPayload, aud: 'different-client' },
    { ...validPayload, iss: 'https://attacker.example' },
    { ...validPayload, exp: 999 },
    { ...validPayload, sub: '' },
  ];

  for (const payload of invalidPayloads) {
    assert.throws(
      () => parseVerifiedGoogleIdentity(payload, clientId, 1_000_000),
      (error: unknown) => error instanceof GoogleAuthError && error.code === 'GOOGLE_TOKEN_INVALID'
    );
  }
});

test('reports missing Google client configuration without attempting token verification', async () => {
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  try {
    await assert.rejects(
      verifyGoogleCredential('not-a-real-token'),
      (error: unknown) => error instanceof GoogleAuthError && error.code === 'GOOGLE_AUTH_NOT_CONFIGURED'
    );
  } finally {
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
  }
});
