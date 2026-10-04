import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDecimal, formatMatchDate, formatPercent, formatShare, formatTime } from './format';

describe('Spanish (Uruguay) formatting in Montevideo time', () => {
  it('formats the freshness timestamp', () => {
    expect(formatDateTime('2026-10-02T06:12:00Z')).toBe('2 oct 2026, 03:12');
  });

  it('shows Montevideo time whatever the device time zone', () => {
    // 21:45 in Montevideo is 00:45Z the next day; the test runner's TZ is irrelevant.
    expect(formatTime('2025-05-17T00:45:00Z')).toBe('21:45');
    expect(formatMatchDate('2025-05-17T00:45:00Z')).toBe('vie 16 may 2025');
  });

  it('uses a decimal comma', () => {
    expect(formatDecimal(0.71)).toBe('0,71');
    expect(formatPercent(56.7)).toBe('56,7%');
    expect(formatShare(0.62)).toBe('62%');
  });
});
