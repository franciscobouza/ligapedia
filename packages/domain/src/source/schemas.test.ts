import { describe, expect, it } from 'vitest';
import { recorded, recordedResponses } from '../../test/fixtures';
import { req } from './endpoints';
import { isSourceAction, parseSourceResponse } from './schemas';

describe('source response schemas', () => {
  it('accept every recorded fixture response', () => {
    for (const r of recordedResponses()) {
      expect(isSourceAction(r.action), r.action).toBe(true);
      if (!isSourceAction(r.action)) continue;
      const parsed = parseSourceResponse(r.action, r.status, r.body);
      expect(parsed.ok, `${r.action} ${JSON.stringify(r.params)}: ${JSON.stringify(parsed)}`).toBe(true);
    }
  });

  it('map an error body to an empty list (Amonestados of match 92923)', () => {
    const r = recorded(req.detail('Amonestados Locatario', '92923'));
    expect(r.body).toContain('"error"');
    expect(parseSourceResponse('Amonestados Locatario', r.status, r.body)).toEqual({
      ok: true,
      rows: [],
      empty: true,
    });
  });

  it('treat jueces HTTP 500 with an empty body as no referees', () => {
    const r = recorded(req.detail('jueces', '92923'));
    expect(r.status).toBe(500);
    expect(parseSourceResponse('jueces', 500, '')).toEqual({ ok: true, rows: [], empty: true });
  });

  it('treat an empty HTTP 200 body as no records', () => {
    expect(parseSourceResponse('GolesLocatario', 200, '  ')).toMatchObject({ ok: true, rows: [] });
  });

  it('retry other HTTP errors and invalid JSON, but not unexpected shapes', () => {
    expect(parseSourceResponse('GolesLocatario', 500, '')).toMatchObject({ ok: false, retryable: true });
    expect(parseSourceResponse('cargarPartidos', 503, 'x')).toMatchObject({ ok: false, retryable: true });
    expect(parseSourceResponse('cargarPartidos', 200, '<html>')).toMatchObject({ ok: false, retryable: true });
    expect(parseSourceResponse('cargarPartidos', 200, '[{"foo":1}]')).toMatchObject({
      ok: false,
      retryable: false,
    });
    expect(parseSourceResponse('cargarPartidos', 200, '{"rows":[]}')).toMatchObject({ ok: false, retryable: false });
  });

  it('parse lineups with captain marker and shirt number', () => {
    const r = recorded(req.detail('Titulares Locatario', '92923'));
    const parsed = parseSourceResponse('Titulares Locatario', r.status, r.body);
    expect(parsed.ok && parsed.rows[0]).toMatchObject({ Capitan: '(C)', camiseta: '1' });
  });
});
