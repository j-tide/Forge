import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../shared/i18n';
import { formatRelativeTime } from '../utils';

const now = new Date('2026-09-28T12:00:00Z');
const pastDate = (milliseconds: number) => new Date(now.getTime() - milliseconds);
const laterDate = (milliseconds: number) => new Date(now.getTime() + milliseconds);

describe('formatRelativeTime', () => {
  let previousLanguage: string;

  beforeEach(() => {
    previousLanguage = i18n.language;
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await i18n.changeLanguage(previousLanguage);
  });

  it('preserves the compact English format', () => {
    expect(formatRelativeTime(pastDate(30_000), 'en')).toBe('just now');
    expect(formatRelativeTime(pastDate(2 * 60_000), 'en')).toBe('2m ago');
    expect(formatRelativeTime(pastDate(3 * 3_600_000), 'en')).toBe('3h ago');
    expect(formatRelativeTime(pastDate(2 * 86_400_000), 'en')).toBe('2d ago');
  });

  it('uses the current interface language when no locale is supplied', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(formatRelativeTime(pastDate(30_000))).toBe('刚刚');
    expect(formatRelativeTime(pastDate(2 * 60_000))).toBe('2分钟前');
    expect(formatRelativeTime(pastDate(3 * 3_600_000))).toBe('3小时前');
    expect(formatRelativeTime(pastDate(2 * 86_400_000))).toBe('2天前');
    expect(formatRelativeTime(pastDate(2 * 60_000), 'en')).toBe('2m ago');
    await i18n.changeLanguage('en');
    expect(formatRelativeTime(pastDate(2 * 60_000))).toBe('2m ago');
  });

  it('does not describe future dates as past dates', () => {
    expect(formatRelativeTime(laterDate(30_000), 'zh-CN')).toBe('即将');
    expect(formatRelativeTime(laterDate(30_000), 'en')).toBe('in a moment');
    expect(formatRelativeTime(laterDate(2 * 60_000), 'zh-CN')).toBe('2分钟后');
    expect(formatRelativeTime(laterDate(2 * 60_000), 'en')).toBe('in 2m');
    expect(formatRelativeTime(laterDate(3 * 3_600_000), 'zh-CN')).toBe('3小时后');
    expect(formatRelativeTime(laterDate(2 * 86_400_000), 'en')).toBe('in 2d');
  });

  it('formats dates outside the relative range using the supplied locale', () => {
    const oldDate = pastDate(8 * 86_400_000);
    const futureDate = laterDate(8 * 86_400_000);
    expect(formatRelativeTime(oldDate, 'zh-CN')).toBe(oldDate.toLocaleDateString('zh-CN'));
    expect(formatRelativeTime(oldDate, 'en')).toBe(oldDate.toLocaleDateString('en'));
    expect(formatRelativeTime(futureDate, 'zh-CN')).toBe(futureDate.toLocaleDateString('zh-CN'));
  });
});
