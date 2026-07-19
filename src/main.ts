import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ensureUploadDirs, UPLOAD_DIR } from './media/storage';

async function bootstrap() {
  ensureUploadDirs();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const prefix = process.env.API_PREFIX || 'api/v1';
  app.setGlobalPrefix(prefix);

  // Serve uploaded media at /uploads (outside the API prefix).
  app.useStaticAssets(UPLOAD_DIR, { prefix: '/uploads/' });

  // Allow images to be embedded cross-origin (avatars loaded by the app).
  app.use(helmet({ crossOriginResourcePolicy: false }));

  const origins = process.env.CORS_ORIGINS || '*';
  app.enableCors({
    origin: origins === '*' ? true : origins.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MatchVenture API')
    .setDescription('Investor ↔ Innovator matchmaking backend')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${prefix}/docs`, app, document);

  // Hostinger (and most managed Node hosts) inject PORT — always honor it.
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
  Logger.log(`MatchVenture API running on :${port}/${prefix}`, 'Bootstrap');
}

bootstrap();
