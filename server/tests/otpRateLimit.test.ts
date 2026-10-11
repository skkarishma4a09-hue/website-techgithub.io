import assert from 'node:assert/strict';
import test from 'node:test';
import { getOtpRequestLimitResult } from '../services/otpService.js';

test('allows OTP requests below the hourly limit', () => {
  assert.equal(getOtpRequestLimitResult(9, 10), null);
});

test('returns a rate-limit error at the hourly request limit', () => {
  const oldestRequest = new Date('2026-01-01T12:00:00.000Z');
  const result = getOtpRequestLimitResult(10, 10, oldestRequest);

  assert.equal(result?.success, false);
  assert.equal(result?.code, 'OTP_RATE_LIMIT');
  assert.equal(
    result?.resendAvailableAt?.toISOString(),
    '2026-01-01T13:00:00.000Z'
  );
});

test('does not invent a retry time when the oldest request is unavailable', () => {
  const result = getOtpRequestLimitResult(10, 10);

  assert.equal(result?.code, 'OTP_RATE_LIMIT');
  assert.equal(result?.resendAvailableAt, undefined);
});
