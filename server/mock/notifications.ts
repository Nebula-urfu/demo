import { getDb } from '../db'
import type { NotificationsGateway } from '../gateway'
import { nowIso } from '../utils/time'

export class MockNotifications implements NotificationsGateway {
  record(orgId: string, topic: 'ai.jobs' | 'ai.results' | 'notifications', type: string, requestId: string | null, payload: unknown) {
    getDb()
      .prepare('INSERT INTO event_log (ts, org_id, topic, type, request_id, payload_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nowIso(), orgId, topic, type, requestId, JSON.stringify(payload))
  }

  notify(orgId: string, requestId: string | null, to: 'STAFF' | 'REVIEWER', text: string, urgent = false) {
    this.record(orgId, 'notifications', 'notify', requestId, { to, text, urgent })
  }
}
