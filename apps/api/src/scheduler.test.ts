import { describe, expect, it } from 'vitest';
import { nextRunAt } from './scheduler';

describe('daily refresh schedule (03:00 America/Montevideo)', () => {
  it('runs later the same day when it is before 03:00 in Montevideo', () => {
    // 02:30 in Montevideo = 05:30 UTC
    expect(nextRunAt(new Date('2026-10-04T05:30:00Z')).toISOString()).toBe('2026-10-04T06:00:00.000Z');
  });

  it('runs the next day when 03:00 has passed', () => {
    expect(nextRunAt(new Date('2026-10-04T06:00:00Z')).toISOString()).toBe('2026-10-05T06:00:00.000Z');
    expect(nextRunAt(new Date('2026-10-04T23:59:00Z')).toISOString()).toBe('2026-10-05T06:00:00.000Z');
  });

  it('handles the turn of the year', () => {
    expect(nextRunAt(new Date('2026-12-31T12:00:00Z')).toISOString()).toBe('2027-01-01T06:00:00.000Z');
  });
});
