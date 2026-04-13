import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHandoffRouter, type HandoffRouter } from '../../src/agents/handoff-router.js';
import { createMsgHub, type MsgHub } from '../../src/agents/msghub.js';
import { createAgentRegistry, type AgentRegistry } from '../../src/agents/agent-registry.js';
import { createTestDb, createTestEventBus, makeAgent, resetAgentCounter } from './test-helpers.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';

describe('HandoffRouter', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let msgHub: MsgHub;
  let registry: AgentRegistry;
  let router: HandoffRouter;

  beforeEach(() => {
    resetAgentCounter();
    db = createTestDb();
    eventBus = createTestEventBus(db);
    msgHub = createMsgHub(eventBus);
    registry = createAgentRegistry(db, eventBus);
    router = createHandoffRouter(msgHub, registry, eventBus);
  });

  describe('detectHandoff()', () => {
    it('should detect structured HANDOFF pattern', () => {
      const result = router.detectHandoff('HANDOFF:reviewer:Please review this code');
      expect(result).toBeDefined();
      expect(result!.target).toBe('reviewer');
      expect(result!.context).toBe('Please review this code');
    });

    it('should detect JSON handoff pattern', () => {
      const result = router.detectHandoff(
        'Some output {"handoff": "analyst", "context": "Analyze the data"} more text',
      );
      expect(result).toBeDefined();
      expect(result!.target).toBe('analyst');
      expect(result!.context).toBe('Analyze the data');
    });

    it('should detect natural language handoff', () => {
      const result = router.detectHandoff('I am handing off to coder with more context');
      expect(result).toBeDefined();
      expect(result!.target).toBe('coder');
    });

    it('should detect "hand off to" pattern', () => {
      const result = router.detectHandoff('Please hand off to designer');
      expect(result).toBeDefined();
      expect(result!.target).toBe('designer');
    });

    it('should return null for no handoff', () => {
      const result = router.detectHandoff('This is normal output with no handoff.');
      expect(result).toBeNull();
    });
  });

  describe('routeHandoff()', () => {
    it('should route handoff to active agent with matching role', () => {
      const agent = makeAgent({ role: 'reviewer' });
      registry.register(agent);

      const handler = vi.fn();
      msgHub.subscribe(agent.id, handler);

      const result = router.routeHandoff('from-agent', 'reviewer', 'review this');
      expect(result).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should return false when target role not found', () => {
      const result = router.routeHandoff('from-agent', 'nonexistent', 'context');
      expect(result).toBe(false);
    });
  });

  describe('processAgentOutput()', () => {
    it('should return output unchanged if no handoff detected', () => {
      const output = 'Normal output text.';
      expect(router.processAgentOutput('agent-1', output)).toBe(output);
    });

    it('should strip structured handoff and route', () => {
      const agent = makeAgent({ role: 'reviewer' });
      registry.register(agent);
      msgHub.subscribe(agent.id, vi.fn());

      const output = 'Some result.\nHANDOFF:reviewer:please check';
      const cleaned = router.processAgentOutput('agent-x', output);
      expect(cleaned).not.toContain('HANDOFF');
    });

    it('should strip JSON handoff and route', () => {
      const agent = makeAgent({ role: 'analyst' });
      registry.register(agent);
      msgHub.subscribe(agent.id, vi.fn());

      const output = 'Result here. {"handoff": "analyst", "context": "analyze"} Done.';
      const cleaned = router.processAgentOutput('agent-x', output);
      expect(cleaned).not.toContain('"handoff"');
    });
  });
});
