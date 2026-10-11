import { OAuth2Client } from 'google-auth-library';

import { logger } from '../../lib/logger.js';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/**
 * App lấy ID token từ Google SDK và gửi lên; server chỉ VERIFY, không có OAuth redirect (design 8).
 * Đứng sau interface để test HTTP tiêm bản giả — không có test nào gọi ra Google.
 */
export interface GoogleTokenVerifier {
  /** `null` khi token không hợp lệ, không phát cho app này, hoặc đăng nhập Google đang tắt. */
  verify(idToken: string): Promise<GoogleIdentity | null>;
}

export function createGoogleTokenVerifier(clientIds: string[]): GoogleTokenVerifier {
  const client = new OAuth2Client();
  return {
    async verify(idToken) {
      // Không có client id = đăng nhập Google tắt (env.ts cho phép ở dev): mọi token đều bị từ chối.
      if (clientIds.length === 0) return null;
      try {
        const ticket = await client.verifyIdToken({ idToken, audience: clientIds });
        const payload = ticket.getPayload();
        if (!payload?.sub || !payload.email) return null;
        return {
          sub: payload.sub,
          email: payload.email,
          emailVerified: payload.email_verified === true,
          name: payload.name ?? null,
          picture: payload.picture ?? null,
        };
      } catch (error) {
        // Token giả hay hết hạn là chuyện thường ngày, không phải sự cố: ghi debug, trả null.
        logger.debug({ err: error }, 'ID token Google không hợp lệ');
        return null;
      }
    },
  };
}
