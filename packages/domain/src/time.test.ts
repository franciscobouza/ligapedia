import { describe, expect, it } from 'vitest';
import { montevideoDate, montevideoToUtc } from './time';

describe('Montevideo time', () => {
  it('converts wall-clock time at UTC−03:00 (no DST since 2015)', () => {
    expect(montevideoToUtc('2025-05-16 20:45:00')?.toISOString()).toBe('2025-05-16T23:45:00.000Z');
    expect(montevideoToUtc('2026-01-10 03:00')?.toISOString()).toBe('2026-01-10T06:00:00.000Z');
  });

  it('honors the daylight-saving time Uruguay used before 2015 (UTC−02:00 in summer)', () => {
    expect(montevideoToUtc('2010-11-15 21:00:00')?.toISOString()).toBe('2010-11-15T23:00:00.000Z');
    expect(montevideoToUtc('2010-07-09 21:00:00')?.toISOString()).toBe('2010-07-10T00:00:00.000Z');
  });

  it('returns null for missing or malformed values', () => {
    expect(montevideoToUtc(null)).toBeNull();
    expect(montevideoToUtc('mañana')).toBeNull();
  });

  it('computes the Montevideo calendar day of an instant', () => {
    expect(montevideoDate(new Date('2026-10-03T02:59:00Z'))).toBe('2026-10-02');
    expect(montevideoDate(new Date('2026-10-03T03:00:00Z'))).toBe('2026-10-03');
  });
});
