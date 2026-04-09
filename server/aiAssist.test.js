import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chatCompletionsUrl, readAiAssistConfig, runAiChat, sanitizeClientMessages } from './aiAssist.js';

describe('aiAssist', () => {
  it('chatCompletionsUrl handles base with or without /v1', () => {
    expect(chatCompletionsUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/chat/completions');
    expect(chatCompletionsUrl('https://api.openai.com')).toBe('https://api.openai.com/v1/chat/completions');
    expect(chatCompletionsUrl('https://example.com/api/')).toBe('https://example.com/api/v1/chat/completions');
  });

  it('sanitizeClientMessages keeps user/assistant and caps length', () => {
    const long = 'x'.repeat(9000);
    const out = sanitizeClientMessages([
      { role: 'system', content: 'ignore' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'yo' },
      { role: 'user', content: long },
    ]);
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(out[2].content.endsWith('…')).toBe(true);
    expect(out[2].content.length).toBeLessThanOrEqual(8001);
  });

  describe('runAiChat with env + fetch mock', () => {
    const saved = {};

    beforeEach(() => {
      saved.ZAREWA_AI_API_KEY = process.env.ZAREWA_AI_API_KEY;
      saved.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      saved.ZAREWA_AI_BASE_URL = process.env.ZAREWA_AI_BASE_URL;
      saved.ZAREWA_AI_MODEL = process.env.ZAREWA_AI_MODEL;
      process.env.ZAREWA_AI_API_KEY = 'test-key';
      process.env.ZAREWA_AI_BASE_URL = 'https://api.openai.com/v1';
      process.env.ZAREWA_AI_MODEL = 'gpt-test';
    });

    afterEach(() => {
      for (const k of ['ZAREWA_AI_API_KEY', 'OPENAI_API_KEY', 'ZAREWA_AI_BASE_URL', 'ZAREWA_AI_MODEL']) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      vi.restoreAllMocks();
    });

    it('readAiAssistConfig picks ZAREWA_AI_API_KEY over OPENAI_API_KEY', () => {
      process.env.OPENAI_API_KEY = 'openai';
      process.env.ZAREWA_AI_API_KEY = 'zarewa';
      const c = readAiAssistConfig();
      expect(c.enabled).toBe(true);
      expect(c.apiKey).toBe('zarewa');
    });

    it('runAiChat returns assistant content', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          text: async () =>
            JSON.stringify({
              choices: [{ message: { role: 'assistant', content: 'Hello from mock.' } }],
            }),
        }))
      );
      const r = await runAiChat({ messages: [{ role: 'user', content: 'Hi' }] });
      expect(r.content).toBe('Hello from mock.');
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
