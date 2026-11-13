import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigModule } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';

describe('AppModule', () => {
  it('loads environment variables through the Nest config module', async () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    const resolvedImports = await Promise.all(imports);

    expect(resolvedImports).toContainEqual(expect.objectContaining({ module: ConfigModule, global: true }));
  });
});
