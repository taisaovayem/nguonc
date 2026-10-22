import { describe, expect, it } from 'vitest';
import { publicBaseUrlSetting } from './runtime-config.js';

describe('publicBaseUrlSetting', () => {
  it('allows an HTTP localhost URL for local development', () => {
    expect(publicBaseUrlSetting(config({ PUBLIC_BASE_URL: 'http://localhost:3000' }))).toBe('http://localhost:3000/');
  });

  it('allows an HTTP public URL when the deployment does not use HTTPS', () => {
    expect(publicBaseUrlSetting(config({ PUBLIC_BASE_URL: 'http://addon.example.com' }))).toBe('http://addon.example.com/');
  });
});

function config(values: Record<string, string>) {
  return {
    get<T = string>(name: string): T | undefined {
      return values[name] as T | undefined;
    },
  };
}
