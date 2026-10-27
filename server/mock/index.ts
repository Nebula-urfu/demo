import type { Gateways } from '../gateway'
import { MockAi } from './ai'
import { MockDocuments } from './documents'
import { MockNotifications } from './notifications'
import { MockReference } from './reference'

export function createMockGateways(): Gateways {
  return {
    ai: new MockAi(),
    documents: new MockDocuments(),
    reference: new MockReference(),
    notifications: new MockNotifications(),
  }
}
