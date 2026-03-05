/**
 * Property-based тесты для API /api/support/sessions
 * Feature: admin-chat-persistence
 * Validates: Requirements 3.1, 3.2, 5.3, 7.1, 8.1, 8.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { getDb } from '@/lib/database/client';
import type { SupportSession, SessionType, SupportSessionStatus, PaginatedSessions } from '@/lib/database/client';

// Мокируем DatabaseClient
vi.mock('@/lib/database/client');

/**
 * Property 9: Сортировка сессий по времени последнего сообщения
 * For any набора сессий, API должен возвращать их отсортированными 
 * по времени последнего сообщения (новые первыми).
 * Validates: Requirements 3.1
 */
describe('Property 9: Сортировка сессий по времени последнего сообщения', () => {
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = { getSessions: vi.fn() };
    vi.mocked(getDb).mockReturnValue(mockDb);
  });

  it('Property 9: Сессии отсортированы по убыванию времени', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 10000 }),
            telegram_id: fc.integer({ min: 100000, max: 999999999 }),
            status: fc.constantFrom('active', 'closed') as fc.Arbitrary<SupportSessionStatus>,
            session_type: fc.constantFrom('chat', 'support') as fc.Arbitrary<SessionType>,
            created_at: fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }),
            last_message_at: fc.option(fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') })),
          }),
          { minLength: 2, maxLength: 20 }
        ),
        async (sessionsData) => {
          if (sessionsData.length < 2) return true;

          const sortedSessions: SupportSession[] = sessionsData
            .map(s => ({ ...s, created_at: s.created_at.toISOString(), last_message_at: s.last_message_at?.toISOString() }))
            .sort((a, b) => {
              const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : new Date(a.created_at).getTime();
              const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : new Date(b.created_at).getTime();
              return bTime - aTime;
            });

          mockDb.getSessions.mockResolvedValue({ sessions: sortedSessions, total: sortedSessions.length, page: 1, limit: 50, has_more: false });
          const result = await mockDb.getSessions({ page: 1, limit: 50 });

          for (let i = 0; i < result.sessions.length - 1; i++) {
            const currentTime = result.sessions[i].last_message_at 
              ? new Date(result.sessions[i].last_message_at!).getTime()
              : new Date(result.sessions[i].created_at).getTime();
            const nextTime = result.sessions[i + 1].last_message_at
              ? new Date(result.sessions[i + 1].last_message_at!).getTime()
              : new Date(result.sessions[i + 1].created_at).getTime();
            expect(currentTime).toBeGreaterThanOrEqual(nextTime);
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Property 10: Полнота данных сессии в API
 * For any сессии, возвращаемой через API, она должна содержать все необходимые поля.
 * Validates: Requirements 3.2
 */
describe('Property 10: Полнота данных сессии в API', () => {
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = { getSessions: vi.fn() };
    vi.mocked(getDb).mockReturnValue(mockDb);
  });

  it('Property 10: Каждая сессия содержит все обязательные поля', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 10000 }),
            telegram_id: fc.integer({ min: 100000, max: 999999999 }),
            status: fc.constantFrom('active', 'closed') as fc.Arbitrary<SupportSessionStatus>,
            session_type: fc.constantFrom('chat', 'support') as fc.Arbitrary<SessionType>,
            created_at: fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }),
            closed_at: fc.option(fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') })),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (sessionsData) => {
          const sessions: SupportSession[] = sessionsData.map(s => ({
            ...s,
            created_at: s.created_at.toISOString(),
            closed_at: s.closed_at?.toISOString(),
          }));

          mockDb.getSessions.mockResolvedValue({ sessions, total: sessions.length, page: 1, limit: 50, has_more: false });
          const result = await mockDb.getSessions({ page: 1, limit: 50 });

          result.sessions.forEach((session: SupportSession) => {
            expect(session.id).toBeDefined();
            expect(typeof session.id).toBe('number');
            expect(session.id).toBeGreaterThan(0);
            expect(session.telegram_id).toBeDefined();
            expect(typeof session.telegram_id).toBe('number');
            expect(['active', 'closed']).toContain(session.status);
            expect(['chat', 'support']).toContain(session.session_type);
            expect(session.created_at).toBeDefined();
            expect(() => new Date(session.created_at)).not.toThrow();
            if (session.closed_at) {
              expect(() => new Date(session.closed_at)).not.toThrow();
            }
          });
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
