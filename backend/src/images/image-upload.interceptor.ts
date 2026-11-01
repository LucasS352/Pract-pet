import { CallHandler, ExecutionContext, HttpException, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import { defer, finalize, Observable } from 'rxjs';

// Runs BEFORE Multer so excess simultaneous uploads are refused before buffering.
@Injectable()
export class ImageUploadAdmissionInterceptor implements NestInterceptor {
  private static active = 0;
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ImageUploadAdmissionInterceptor.active >= 2) {
      context.switchToHttp().getResponse().setHeader('Retry-After', '5');
      throw new HttpException('Há uploads em andamento. Aguarde alguns segundos antes de tentar novamente.', HttpStatus.TOO_MANY_REQUESTS);
    }
    ImageUploadAdmissionInterceptor.active++;
    return defer(() => next.handle()).pipe(finalize(() => ImageUploadAdmissionInterceptor.active--));
  }
}
