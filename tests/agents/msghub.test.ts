import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMsgHub, type MsgHub, type AgentMessage } from '../../src/agents/msghub.js';
import { createTestDb, createTestEventBus } from './test-helpers.js';

describe('MsgHub', () => {
  let msgHub: MsgHub;

  beforeEach(() => {
    const db = createTestDb();
    const eventBus = createTestEventBus(db);
    msgHub = createMsgHub(eventBus);
  });

  describe('send()', () => {
    it('should send point-to-point message and store in history', () => {
      const handler = vi.fn();
      msgHub.subscribe('agent-b', handler);

      const msg: AgentMessage = {
        id: 'msg-1',
        from: 'agent-a',
        to: 'agent-b',
        content: 'hello',
        type: 'task',
        timestamp: new Date().toISOString(),
      };

      msgHub.send('agent-a', 'agent-b', msg);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(msgHub.getMessageCount()).toBe(1);
    });

    it('should broadcast to all subscribers except sender', () => {
      const handlerB = vi.fn();
      const handlerC = vi.fn();
      const handlerA = vi.fn();

      msgHub.subscribe('agent-a', handlerA);
      msgHub.subscribe('agent-b', handlerB);
      msgHub.subscribe('agent-c', handlerC);

      const msg: AgentMessage = {
        id: 'msg-2',
        from: 'agent-a',
        to: 'broadcast',
        content: 'hello all',
        type: 'broadcast',
        timestamp: new Date().toISOString(),
      };

      msgHub.send('agent-a', 'broadcast', msg);

      expect(handlerA).not.toHaveBeenCalled();
      expect(handlerB).toHaveBeenCalledTimes(1);
      expect(handlerC).toHaveBeenCalledTimes(1);
    });

    it('should throw on sender mismatch', () => {
      const msg: AgentMessage = {
        id: 'msg-3',
        from: 'agent-x',
        to: 'agent-b',
        content: 'hello',
        type: 'task',
        timestamp: new Date().toISOString(),
      };

      expect(() => msgHub.send('agent-a', 'agent-b', msg)).toThrow('sender mismatch');
    });

    it('should handle message with no subscribers silently', () => {
      const msg: AgentMessage = {
        id: 'msg-4',
        from: 'agent-a',
        to: 'agent-b',
        content: 'hello',
        type: 'task',
        timestamp: new Date().toISOString(),
      };

      expect(() => msgHub.send('agent-a', 'agent-b', msg)).not.toThrow();
      expect(msgHub.getMessageCount()).toBe(1);
    });
  });

  describe('subscribe() / unsubscribe()', () => {
    it('should add handler for agent', () => {
      const handler = vi.fn();
      msgHub.subscribe('agent-a', handler);

      const msg: AgentMessage = {
        id: 'msg-5',
        from: 'agent-b',
        to: 'agent-a',
        content: 'hi',
        type: 'result',
        timestamp: new Date().toISOString(),
      };

      msgHub.send('agent-b', 'agent-a', msg);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should remove handlers on unsubscribe', () => {
      const handler = vi.fn();
      msgHub.subscribe('agent-a', handler);
      msgHub.unsubscribe('agent-a');

      const msg: AgentMessage = {
        id: 'msg-6',
        from: 'agent-b',
        to: 'agent-a',
        content: 'hi',
        type: 'result',
        timestamp: new Date().toISOString(),
      };

      msgHub.send('agent-b', 'agent-a', msg);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('getHistory()', () => {
    it('should return full history when no agentId', () => {
      const msg1: AgentMessage = { id: 'm1', from: 'a', to: 'b', content: '1', type: 'task', timestamp: '' };
      const msg2: AgentMessage = { id: 'm2', from: 'b', to: 'a', content: '2', type: 'result', timestamp: '' };

      msgHub.send('a', 'b', msg1);
      msgHub.send('b', 'a', msg2);

      expect(msgHub.getHistory()).toHaveLength(2);
    });

    it('should filter history by agentId', () => {
      const msg1: AgentMessage = { id: 'm1', from: 'a', to: 'b', content: '1', type: 'task', timestamp: '' };
      const msg2: AgentMessage = { id: 'm2', from: 'c', to: 'd', content: '2', type: 'result', timestamp: '' };

      msgHub.send('a', 'b', msg1);
      msgHub.send('c', 'd', msg2);

      const historyA = msgHub.getHistory('a');
      expect(historyA).toHaveLength(1);
      expect(historyA[0].content).toBe('1');
    });

    it('should include broadcast messages in filtered history', () => {
      msgHub.subscribe('b', vi.fn());
      const msg: AgentMessage = { id: 'm1', from: 'a', to: 'broadcast', content: 'all', type: 'broadcast', timestamp: '' };
      msgHub.send('a', 'broadcast', msg);

      const historyB = msgHub.getHistory('b');
      expect(historyB).toHaveLength(1);
    });
  });

  describe('clear()', () => {
    it('should clear history and subscribers', () => {
      msgHub.subscribe('a', vi.fn());
      const msg: AgentMessage = { id: 'm1', from: 'a', to: 'b', content: '1', type: 'task', timestamp: '' };
      msgHub.send('a', 'b', msg);

      msgHub.clear();

      expect(msgHub.getMessageCount()).toBe(0);
      expect(msgHub.getHistory()).toHaveLength(0);
    });
  });

  describe('getMessageCount()', () => {
    it('should return 0 for empty hub', () => {
      expect(msgHub.getMessageCount()).toBe(0);
    });

    it('should increment on each message', () => {
      const msg: AgentMessage = { id: 'm1', from: 'a', to: 'b', content: '1', type: 'task', timestamp: '' };
      msgHub.send('a', 'b', msg);
      expect(msgHub.getMessageCount()).toBe(1);
    });
  });
});
