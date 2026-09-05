import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: config.getOrThrow<string[]>('WEB_ORIGIN'),
    credentials: true,
  });
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port}/api`);
}

await bootstrap();
