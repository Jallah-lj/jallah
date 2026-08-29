/**
 * Central Zod validation schemas for the API's mutable request bodies.
 *
 * Extracted from app.ts so the same rules are used by the routes and can be
 * exercised by unit tests without spinning up the server.
 */
import { z } from 'zod';

/** `POST /api/auth/login` */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/** `PUT /api/account` */
export const accountSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  currentPassword: z.string().min(8),
  // newPassword is optional; empty string means "keep existing password".
  newPassword: z.string().min(10).max(128).optional().or(z.literal('')),
});

/** `POST /api/contact` (public contact form) */
export const contactSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  subject: z.string().min(2).max(120),
  message: z.string().min(10).max(3000),
  // Honeypot field — a real visitor never fills it, so it must stay empty.
  website: z.string().max(0).optional(),
});
