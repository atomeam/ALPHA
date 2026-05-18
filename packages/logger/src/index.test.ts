import { describe, expect, it } from 'vitest';
import { createLogger } from './index.ts';

function captureSink() {
  const lines: string[] = [];
  return {
    lines,
    sink: (line: string) => {
      lines.push(line);
    },
  };
}

describe('createLogger', () => {
  it('emits a JSON line with ts, service, level, event', () => {
    const cap = captureSink();
    const log = createLogger({
      service: 'backend',
      sink: cap.sink,
      now: () => new Date('2026-05-14T12:00:00Z'),
    });
    log.info('integration-call', { integration_id: 'notion', status: 'ok' });
    expect(cap.lines).toHaveLength(1);
    expect(JSON.parse(cap.lines[0]!)).toEqual({
      ts: '2026-05-14T12:00:00.000Z',
      service: 'backend',
      level: 'info',
      event: 'integration-call',
      integration_id: 'notion',
      status: 'ok',
    });
  });

  it('respects minLevel', () => {
    const cap = captureSink();
    const log = createLogger({ service: 's', sink: cap.sink, minLevel: 'warn' });
    log.info('skipped');
    log.debug('skipped');
    log.warn('kept');
    log.error('kept');
    expect(cap.lines).toHaveLength(2);
    expect(JSON.parse(cap.lines[0]!).event).toBe('kept');
    expect(JSON.parse(cap.lines[0]!).level).toBe('warn');
    expect(JSON.parse(cap.lines[1]!).level).toBe('error');
  });

  it('emits a grant-denied event with status code', () => {
    const cap = captureSink();
    const log = createLogger({ service: 'backend', sink: cap.sink });
    log.warn('grant-denied', {
      integration_id: 'slack',
      scope: 'slack:channel:post:C123',
      status: 'missing_grant',
    });
    const parsed = JSON.parse(cap.lines[0]!);
    expect(parsed.event).toBe('grant-denied');
    expect(parsed.status).toBe('missing_grant');
    expect(parsed.scope).toBe('slack:channel:post:C123');
  });
});
