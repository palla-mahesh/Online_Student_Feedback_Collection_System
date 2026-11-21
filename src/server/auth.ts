import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  return process.env.AUTH_SECRET || process.env.JWT_SECRET_KEY || process.env.FLASK_SECRET_KEY || EPHEMERAL_SECRET;
}

export interface AuthPayload {
  sub: number;
  email: string;
  role: 'student' | 'faculty' | 'admin';
  name: string;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function signAuthToken(payload: Omit<AuthPayload, 'exp'>, ttlSeconds = 60 * 60 * 12): string {
  const fullPayload: AuthPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = base64UrlEncode(
    crypto.createHmac('sha256', getSigningSecret()).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${signature}`;
}

export function verifyAuthToken(token: string): AuthPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', getSigningSecret()).update(`${header}.${body}`).digest()
  );
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(base64UrlDecode(body)) as AuthPayload;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expired or invalid token. Please sign in again.' });
    return;
  }
  const userRow = db
    .prepare('SELECT id, is_active FROM users WHERE id = ?')
    .get(payload.sub) as { id: number; is_active: number } | undefined;
  if (!userRow || userRow.is_active !== 1) {
    res.status(403).json({ error: 'Account is inactive or unavailable.' });
    return;
  }
  req.user = payload;
  next();
}

export function requireRole(...allowedRoles: Array<'student' | 'faculty' | 'admin'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: `Access denied. Required role: ${allowedRoles.join(' or ')}.` });
      return;
    }
    next();
  };
}

export function logAudit(params: {
  userId?: number | null;
  userEmail?: string | null;
  userRole?: string | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}): void {
  try {
    db.prepare(
      `INSERT INTO audit_logs (user_id, user_email, user_role, action, entity_type, entity_id, details_json, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.userId ?? null,
      params.userEmail ?? null,
      params.userRole ?? null,
      params.action,
      params.entityType,
      params.entityId ?? null,
      JSON.stringify(params.details ?? {}),
      params.ipAddress ?? null
    );
  } catch (err) {
    console.error('Audit log insert error:', err);
  }
}

export function createRateLimiter(maxRequests: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
      });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
