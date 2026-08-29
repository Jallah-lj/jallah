import { describe, it, expect } from 'vitest';
import { loginSchema, accountSchema, contactSchema } from './validation.ts';

describe('loginSchema', () => {
  it('accepts a valid email + password', () => {
    const r = loginSchema.safeParse({ email: 'admin@atlas.dev', password: 'ChangeMe123!' });
    expect(r.success).toBe(true);
  });

  it('rejects a malformed email', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'ChangeMe123!' }).success).toBe(false);
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(loginSchema.safeParse({ email: 'admin@atlas.dev', password: 'short' }).success).toBe(false);
  });
});

describe('accountSchema', () => {
  const base = { name: 'Jallah', email: 'admin@atlas.dev', currentPassword: 'ChangeMe123!' };

  it('accepts a valid update without a new password', () => {
    expect(accountSchema.safeParse({ ...base }).success).toBe(true);
  });

  it('accepts an empty newPassword (keep existing password)', () => {
    expect(accountSchema.safeParse({ ...base, newPassword: '' }).success).toBe(true);
  });

  it('accepts a strong new password', () => {
    expect(accountSchema.safeParse({ ...base, newPassword: 'A-very-long-password' }).success).toBe(true);
  });

  it('rejects a too-short new password', () => {
    expect(accountSchema.safeParse({ ...base, newPassword: 'tiny' }).success).toBe(false);
  });

  it('rejects a short current password', () => {
    expect(accountSchema.safeParse({ ...base, currentPassword: 'x' }).success).toBe(false);
  });

  it('rejects a name that is too short', () => {
    expect(accountSchema.safeParse({ ...base, name: 'A' }).success).toBe(false);
  });
});

describe('contactSchema', () => {
  const base = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Project inquiry',
    message: 'I would like to discuss a project with you.',
  };

  it('accepts a valid message', () => {
    expect(contactSchema.safeParse(base).success).toBe(true);
  });

  it('accepts an empty honeypot website field', () => {
    expect(contactSchema.safeParse({ ...base, website: '' }).success).toBe(true);
  });

  it('rejects a filled honeypot field (spam bot)', () => {
    expect(contactSchema.safeParse({ ...base, website: 'https://spam.example' }).success).toBe(false);
  });

  it('rejects a message that is too short', () => {
    expect(contactSchema.safeParse({ ...base, message: 'too short' }).success).toBe(false);
  });

  it('rejects a missing email', () => {
    const { email: _omitted, ...rest } = base;
    expect(contactSchema.safeParse(rest).success).toBe(false);
  });
});
