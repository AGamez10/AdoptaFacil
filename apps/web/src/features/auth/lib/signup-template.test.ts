import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../../shell/api';
import { applySignupTemplate, forgetSignupTemplate, readSignupTemplate } from './signup-template';

afterEach(() => forgetSignupTemplate());

function client(template?: string) {
  const request = vi.fn(async (_path: string, init?: { method?: string }) =>
    init?.method === 'PUT' ? {} : { tokens: { primary: '1 2% 3%' }, template },
  );
  return { request, api: { request } as unknown as ApiClient };
}

describe('signup template', () => {
  it('reads a valid template from the URL and remembers it for the tab', () => {
    expect(readSignupTemplate(new URLSearchParams('plantilla=revista'))).toBe('revista');
    expect(readSignupTemplate(new URLSearchParams())).toBe('revista');
  });

  it('ignores unknown templates', () => {
    expect(readSignupTemplate(new URLSearchParams('plantilla=<script>'))).toBeNull();
  });

  it('saves the template keeping the stored colors', async () => {
    const { request, api } = client(undefined);
    await applySignupTemplate(api, 'hogar');
    expect(request).toHaveBeenLastCalledWith('/portals/theme', {
      method: 'PUT',
      json: { tokens: { primary: '1 2% 3%' }, template: 'hogar' },
    });
  });

  it('never overwrites a template the organization already chose', async () => {
    const { request, api } = client('cine');
    await applySignupTemplate(api, 'hogar');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
