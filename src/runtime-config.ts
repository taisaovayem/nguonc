export interface ConfigReader {
  get<T = string>(name: string): T | undefined;
}

export function publicBaseUrlSetting(config: ConfigReader): string {
  const value = config.get<string>('PUBLIC_BASE_URL');
  if (!value) throw new Error('PUBLIC_BASE_URL must be configured');

  return new URL(value).toString();
}
