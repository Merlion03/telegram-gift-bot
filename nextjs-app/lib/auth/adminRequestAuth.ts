import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { JWTSessionService } from '@/lib/services/jwtSessionService';

export interface AdminRequestAuth {
  adminId: string;
  tgId?: number;
  role?: number;
  source: 'middleware' | 'cookie' | 'nextauth';
}

function parseNumberHeader(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractBearerToken(authorization: string | null): string | null {
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

async function validateAdminCookieToken(token: string): Promise<{ tgId: number; role: number } | null> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return null;
  }

  try {
    const jwtService = new JWTSessionService({
      secretKey: jwtSecret,
    });
    const claims = await jwtService.validateToken(token);
    if (!claims) {
      return null;
    }

    return {
      tgId: claims.tgId,
      role: claims.role,
    };
  } catch (error) {
    console.error('[AdminRequestAuth] Failed to validate admin-token:', error);
    return null;
  }
}

export async function resolveAdminRequestAuth(request: NextRequest): Promise<AdminRequestAuth | null> {
  const tgIdFromHeader = parseNumberHeader(request.headers.get('x-admin-tgid'));
  if (tgIdFromHeader !== null && tgIdFromHeader > 0) {
    const roleFromHeader = parseNumberHeader(request.headers.get('x-admin-role'));

    return {
      adminId: `tg:${tgIdFromHeader}`,
      tgId: tgIdFromHeader,
      role: roleFromHeader ?? undefined,
      source: 'middleware',
    };
  }

  const adminTokenFromCookie = request.cookies.get('admin-token')?.value;
  const adminTokenFromHeader = extractBearerToken(request.headers.get('authorization'));
  const adminToken = adminTokenFromCookie ?? adminTokenFromHeader;

  if (adminToken) {
    const claims = await validateAdminCookieToken(adminToken);
    if (claims) {
      return {
        adminId: `tg:${claims.tgId}`,
        tgId: claims.tgId,
        role: claims.role,
        source: 'cookie',
      };
    }
  }

  const nextAuthSession = await getServerSession(authOptions);
  if (nextAuthSession) {
    return {
      adminId: nextAuthSession.user?.email || 'nextauth-admin',
      source: 'nextauth',
    };
  }

  return null;
}
