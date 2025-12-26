import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import * as nodeCrypto from 'crypto';
dotenv.config();

// Ensure global crypto exists for libraries expecting Web Crypto API (e.g., @nestjs/schedule)
if (!(global as any).crypto) {
  (global as any).crypto = nodeCrypto as any;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3507);
}
bootstrap();
