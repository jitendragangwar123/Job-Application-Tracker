import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { Errors } from './errors';

type TokenType = 'access' | 'refresh';

export interface TokenPayload {
  sub: string; // user id
  email: string;
  typ: TokenType;
}

function sign(payload: Omit<TokenPayload, 'typ'>, typ: TokenType, ttl: string): string {
  const opts: SignOptions = { expiresIn: ttl as SignOptions['expiresIn'] };
  return jwt.sign({ ...payload, typ }, env.jwt.secret, opts);
}

export function signAccessToken(userId: string, email: string): string {
  return sign({ sub: userId, email }, 'access', env.jwt.accessTtl);
}

export function signRefreshToken(userId: string, email: string): string {
  return sign({ sub: userId, email }, 'refresh', env.jwt.refreshTtl);
}

function verify(token: string, expected: TokenType): TokenPayload {
  let decoded: jwt.JwtPayload | string;
  try {
    decoded = jwt.verify(token, env.jwt.secret);
  } catch {
    throw Errors.unauthorized('Invalid or expired token');
  }
  if (typeof decoded === 'string' || !decoded.sub || !decoded.email || decoded.typ !== expected) {
    throw Errors.unauthorized('Invalid token');
  }
  return { sub: decoded.sub, email: decoded.email as string, typ: decoded.typ as TokenType };
}

export function verifyAccessToken(token: string): TokenPayload {
  return verify(token, 'access');
}

export function verifyRefreshToken(token: string): TokenPayload {
  return verify(token, 'refresh');
}
