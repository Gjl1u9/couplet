import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'public/_locales');
const MAX_NAME_LENGTH = 75;
const MAX_SUMMARY_LENGTH = 132;

type Messages = Record<string, { message: string } | undefined>;

const messagesOf = (locale: string) =>
  JSON.parse(
    readFileSync(join(ROOT, locale, 'messages.json'), 'utf8'),
  ) as Messages;

describe.each(readdirSync(ROOT))('the %s store text', (locale) => {
  const messages = messagesOf(locale);

  it('fits the store limits', () => {
    expect(messages.extensionName?.message.length).toBeLessThanOrEqual(
      MAX_NAME_LENGTH,
    );
    expect(messages.extensionDescription?.message.length).toBeLessThanOrEqual(
      MAX_SUMMARY_LENGTH,
    );
  });

  it('names the product and says it has dual subtitles', () => {
    expect(messages.extensionName?.message).toMatch(
      /^Couplet.*(Dual Subtitles|雙字幕)/,
    );
  });
});
