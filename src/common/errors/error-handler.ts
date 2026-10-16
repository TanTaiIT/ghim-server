import { Prisma } from '@prisma/client';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';

import { StorageUnavailableError } from '../../lib/storage/storage.js';
import { AppError } from './app-error.js';

/**
 * Lỗi Prisma map TẬP TRUNG ở đây — service không tự đoán mã Prisma. Service vẫn kiểm trước để
 * có câu báo cụ thể; các nhánh dưới là lúc hai request chen nhau lọt qua chốt đó.
 *
 * - P2002 trùng unique: hai request đăng ký cùng một email, hoặc hai người duyệt cùng mở việc
 *   cho một tin (unique "một việc mở mỗi tin") cùng lúc.
 * - P2025 không tìm thấy dòng để sửa/xoá: dòng vừa bị xoá giữa lúc service kiểm và lúc ghi.
 * - P2003 vướng khoá ngoại: dòng đang được nơi khác trỏ tới, hoặc trỏ tới dòng không tồn tại.
 * - P2034 DB huỷ lượt ghi vì hai lượt chờ khoá của nhau (40P01) hay không xếp được thứ tự (40001) — adapter-pg đổi cả
 *   hai về mã này. Mỗi module khoá theo một thứ tự (vd `group.repository.ts`) để hiếm khi xảy ra; còn sót thì thử lại là
 *   qua (spec http/api-contract, change fix-audit-group).
 *
 * Để 500 thì người dùng tưởng hệ thống hỏng, trong khi thao tác lại là chuyện bình thường.
 */
const PRISMA_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  P2002: { status: 409, code: 'CONFLICT', message: 'Dữ liệu đã tồn tại' },
  P2025: {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Không tìm thấy dữ liệu — có thể vừa bị người khác xoá, tải lại rồi thử lại.',
  },
  P2003: {
    status: 409,
    code: 'CONFLICT',
    message:
      'Dữ liệu liên quan không tồn tại hoặc đang được dùng ở nơi khác — tải lại rồi thử lại.',
  },
  P2034: {
    status: 409,
    code: 'CONFLICT',
    message: 'Thao tác đang chen với một thao tác khác — thử lại.',
  },
};

/**
 * Qua driver adapter (`@prisma/adapter-pg`), lỗi Postgres không có mã Prisma riêng đến dưới dạng
 * P2039, SQLSTATE nằm trong `meta.driverAdapterError.cause.code` (đã kiểm trên Postgres 18 ở dự án
 * booking). Map theo SQLSTATE chứ không map cả P2039: mã đó gom mọi lỗi DB, kể cả lỗi thật sự là 500.
 *
 * - 23P01 exclusion: hai lượt ghi chen nhau cùng chiếm một khoảng mà constraint chỉ cho một —
 *   service đã kiểm trước nhưng cả hai đều qua chốt đó.
 * - 23514 CHECK: dữ liệu không còn hợp lệ với trạng thái hiện tại (vd hai lượt chen nhau làm một
 *   số đếm vượt ràng buộc). 409 chứ không 400: người dùng chỉ cần tải lại, không phải sửa gì.
 */
const POSTGRES_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  '23P01': {
    status: 409,
    code: 'CONFLICT',
    message: 'Trùng với dữ liệu vừa được ghi — tải lại rồi thử lại.',
  },
  '23514': {
    status: 409,
    code: 'CONFLICT',
    message: 'Dữ liệu vừa thay đổi nên thao tác không còn hợp lệ — tải lại rồi thử lại.',
  },
};

function sqlStateOf(error: Prisma.PrismaClientKnownRequestError): string | undefined {
  const adapterError = error.meta?.driverAdapterError;
  if (typeof adapterError !== 'object' || adapterError === null || !('cause' in adapterError)) {
    return undefined;
  }
  const cause = adapterError.cause;
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return undefined;
  return typeof cause.code === 'string' ? cause.code : undefined;
}

/**
 * MỘT cửa ra cho mọi lỗi. Service chỉ `throw new NotFoundError(...)`; không tầng nào khác được
 * tự nặn response lỗi.
 *
 * Thứ tự các nhánh là thứ tự từ HẸP tới RỘNG, và nhánh cuối cố ý nuốt chi tiết: một lỗi không
 * lường trước có thể mang theo câu SQL, đường dẫn file hay giá trị cột — trả nguyên văn ra
 * ngoài là rò rỉ cấu trúc hệ thống cho bất kỳ ai gửi được một request hỏng.
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }

  // Mã Prisma ngoài bảng `PRISMA_ERRORS` rơi xuống nhánh 500 cuối: chưa lường trước thì chưa map.
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const sqlState = error.code === 'P2039' ? sqlStateOf(error) : undefined;
    const mapped = sqlState ? POSTGRES_ERRORS[sqlState] : PRISMA_ERRORS[error.code];
    if (mapped) {
      return reply
        .status(mapped.status)
        .send({ success: false, error: { code: mapped.code, message: mapped.message } });
    }
  }

  // Kho ảnh tạm không trả lời: thao tác lại sau là được, nên không phải "Lỗi hệ thống". Log để thấy kho chập chờn.
  if (error instanceof StorageUnavailableError) {
    request.log.warn({ err: error }, 'Kho ảnh không trả lời');
    return reply.status(503).send({
      success: false,
      error: {
        code: 'STORAGE_UNAVAILABLE',
        message: 'Kho ảnh đang bận — thử lại sau ít phút.',
      },
    });
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu gửi lên không hợp lệ',
        details: error.validation,
      },
    });
  }

  /*
   * Serializer vỡ nghĩa là SERVER trả sai hình dạng đã cam kết trong schema, không phải client
   * gửi sai. Nó phải là 500 và phải được log đầy đủ — đây là lỗi hợp đồng API, thứ dễ trôi qua
   * nhất vì trên máy dev nó thường vẫn "chạy được".
   */
  if (isResponseSerializationError(error)) {
    request.log.error({ err: error, method: error.method, url: error.url }, 'Response sai schema');
    return reply.status(500).send({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống' },
    });
  }

  // 4xx do chính Fastify sinh (body sai JSON, payload quá lớn, 429 của rate-limit...) đã có
  // `statusCode` đúng và câu chữ vô hại — giữ nguyên thay vì quy hết về 500.
  const status = error.statusCode ?? 500;
  if (status < 500) {
    return reply.status(status).send({
      success: false,
      error: { code: error.code ?? 'BAD_REQUEST', message: error.message },
    });
  }

  request.log.error({ err: error }, 'Lỗi không lường trước');
  return reply.status(500).send({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống' },
  });
}
