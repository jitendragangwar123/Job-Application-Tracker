import { prisma } from '../db/prisma';
import { hashPassword, verifyPassword } from './password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './jwt';
import { Errors } from './errors';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  email: string;
}

function issueTokens(userId: string, email: string): AuthTokens {
  return {
    accessToken: signAccessToken(userId, email),
    refreshToken: signRefreshToken(userId, email),
  };
}

export async function registerUser(
  email: string,
  password: string,
): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const normalized = email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) throw Errors.conflict('Email already registered');

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email: normalized, passwordHash },
    select: { id: true, email: true },
  });

  return { user, tokens: issueTokens(user.id, user.email) };
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const normalized = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  // Same error for missing user vs bad password — don't leak which one.
  if (!user) throw Errors.unauthorized('Invalid credentials');

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw Errors.unauthorized('Invalid credentials');

  return {
    user: { id: user.id, email: user.email },
    tokens: issueTokens(user.id, user.email),
  };
}

export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  const payload = verifyRefreshToken(refreshToken);
  // Confirm the user still exists (handles deleted accounts).
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true },
  });
  if (!user) throw Errors.unauthorized('User no longer exists');
  return issueTokens(user.id, user.email);
}
