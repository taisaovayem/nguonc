import type { RequestInit as ImpitRequestInit } from 'impit';
import { Impit } from 'impit';

let impit: Impit | undefined;

function client(): Impit {
  if (!impit) impit = new Impit({ browser: 'chrome' });
  return impit;
}

export type UpstreamFetcher = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => ReturnType<typeof fetch>;

export const browserFetch: UpstreamFetcher = (input, init) =>
  client().fetch(input, init as ImpitRequestInit | undefined) as unknown as ReturnType<typeof fetch>;