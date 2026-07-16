import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { MulterError } from 'multer';
import type { Response } from 'express';

/**
 * Maps multer's upload errors to clean HTTP responses. The one we care about
 * is LIMIT_FILE_SIZE — an over-cap upload — which otherwise surfaces as a
 * generic 500. Scoped to @Catch(MulterError) so every other exception still
 * flows through Nest's default handler untouched.
 */
@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const tooLarge = exception.code === 'LIMIT_FILE_SIZE';
    const statusCode = tooLarge ? 413 : 400;
    res.status(statusCode).json({
      statusCode,
      error: tooLarge ? 'Payload Too Large' : 'Bad Request',
      message: tooLarge
        ? 'File exceeds the maximum upload size'
        : exception.message,
    });
  }
}
