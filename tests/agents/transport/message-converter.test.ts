/**
 * Phase 10b -- Message Converter Tests
 */
import { describe, it, expect } from 'vitest';
import { MessageConverter } from '../../../src/agents/transport/message-converter.js';
import type { AgentMessage } from '../../../src/agents/msghub.js';
import type { A2ATaskMessage } from '../../../src/agents/transport/types.js';

describe('MessageConverter', () => {
  const converter = new MessageConverter();

  // -----------------------------------------------------------------------
  // toA2A
  // -----------------------------------------------------------------------

  describe('toA2A', () => {
    it('converts task message', () => {
      const msg: AgentMessage = {
        id: 'm1', from: 'a', to: 'b', content: 'hello',
        type: 'task', timestamp: '2026-04-02T00:00:00Z',
      };
      const a2a = converter.toA2A(msg);
      expect(a2a.type).toBe('task');
      expect(a2a.from).toBe('a');
      expect(a2a.to).toBe('b');
      expect(a2a.payload.content).toBe('hello');
      expect(a2a.payload.contentType).toBe('text/plain');
    });

    it('converts result to artifact', () => {
      const msg: AgentMessage = {
        id: 'm2', from: 'a', to: 'b', content: 'done',
        type: 'result', timestamp: '2026-04-02T00:00:00Z',
      };
      expect(converter.toA2A(msg).type).toBe('artifact');
    });

    it('converts feedback to status', () => {
      const msg: AgentMessage = {
        id: 'm3', from: 'a', to: 'b', content: 'progress',
        type: 'feedback', timestamp: '2026-04-02T00:00:00Z',
      };
      expect(converter.toA2A(msg).type).toBe('status');
    });

    it('marks handoff in metadata', () => {
      const msg: AgentMessage = {
        id: 'm4', from: 'a', to: 'b', content: 'handoff',
        type: 'handoff', timestamp: '2026-04-02T00:00:00Z',
      };
      const a2a = converter.toA2A(msg);
      expect(a2a.type).toBe('task');
      expect(a2a.payload.metadata?.handoff).toBe(true);
    });

    it('marks broadcast in metadata', () => {
      const msg: AgentMessage = {
        id: 'm5', from: 'a', to: 'all', content: 'broadcast',
        type: 'broadcast', timestamp: '2026-04-02T00:00:00Z',
      };
      const a2a = converter.toA2A(msg);
      expect(a2a.type).toBe('task');
      expect(a2a.payload.metadata?.broadcast).toBe(true);
    });

    it('includes conversationId when provided', () => {
      const msg: AgentMessage = {
        id: 'm6', from: 'a', to: 'b', content: 'x',
        type: 'task', timestamp: '2026-04-02T00:00:00Z',
      };
      const a2a = converter.toA2A(msg, 'conv-1');
      expect(a2a.conversationId).toBe('conv-1');
    });

    it('preserves from field exactly (MsgHub requires from === message.from)', () => {
      const msg: AgentMessage = {
        id: 'm7', from: 'agent-xyz', to: 'b', content: 'x',
        type: 'task', timestamp: '2026-04-02T00:00:00Z',
      };
      const a2a = converter.toA2A(msg);
      const back = converter.fromA2A(a2a);
      expect(back.from).toBe(msg.from);
    });
  });

  // -----------------------------------------------------------------------
  // fromA2A
  // -----------------------------------------------------------------------

  describe('fromA2A', () => {
    it('converts task to task', () => {
      const a2a: A2ATaskMessage = {
        id: 'a1', type: 'task', from: 'a', to: 'b',
        payload: { content: 'hello' }, timestamp: '2026-04-02T00:00:00Z',
      };
      const msg = converter.fromA2A(a2a);
      expect(msg.type).toBe('task');
      expect(msg.content).toBe('hello');
    });

    it('converts artifact to result', () => {
      const a2a: A2ATaskMessage = {
        id: 'a2', type: 'artifact', from: 'a', to: 'b',
        payload: { content: 'output' }, timestamp: '2026-04-02T00:00:00Z',
      };
      expect(converter.fromA2A(a2a).type).toBe('result');
    });

    it('converts status to feedback', () => {
      const a2a: A2ATaskMessage = {
        id: 'a3', type: 'status', from: 'a', to: 'b',
        payload: { content: '50%' }, timestamp: '2026-04-02T00:00:00Z',
      };
      expect(converter.fromA2A(a2a).type).toBe('feedback');
    });

    it('converts cancel with prefix', () => {
      const a2a: A2ATaskMessage = {
        id: 'a4', type: 'cancel', from: 'a', to: 'b',
        payload: { content: 'stopped' }, timestamp: '2026-04-02T00:00:00Z',
      };
      const msg = converter.fromA2A(a2a);
      expect(msg.type).toBe('task');
      expect(msg.content).toBe('[CANCELLED] stopped');
    });

    it('restores handoff from metadata', () => {
      const a2a: A2ATaskMessage = {
        id: 'a5', type: 'task', from: 'a', to: 'b',
        payload: { content: 'x', metadata: { handoff: true } },
        timestamp: '2026-04-02T00:00:00Z',
      };
      expect(converter.fromA2A(a2a).type).toBe('handoff');
    });

    it('restores broadcast from metadata', () => {
      const a2a: A2ATaskMessage = {
        id: 'a6', type: 'task', from: 'a', to: 'all',
        payload: { content: 'x', metadata: { broadcast: true } },
        timestamp: '2026-04-02T00:00:00Z',
      };
      expect(converter.fromA2A(a2a).type).toBe('broadcast');
    });
  });

  // -----------------------------------------------------------------------
  // createA2AMessage
  // -----------------------------------------------------------------------

  describe('createA2AMessage', () => {
    it('creates message with defaults', () => {
      const msg = converter.createA2AMessage({ from: 'a', to: 'b', content: 'hello' });
      expect(msg.type).toBe('task');
      expect(msg.payload.contentType).toBe('text/plain');
      expect(msg.id).toBeTruthy();
      expect(msg.timestamp).toBeTruthy();
    });

    it('creates message with custom type', () => {
      const msg = converter.createA2AMessage({ from: 'a', to: 'b', content: 'x', type: 'artifact' });
      expect(msg.type).toBe('artifact');
    });
  });

  // -----------------------------------------------------------------------
  // Wire format normalization
  // -----------------------------------------------------------------------

  describe('wire format', () => {
    it('toWireType converts to SCREAMING_SNAKE', () => {
      expect(converter.toWireType('task')).toBe('TASK');
      expect(converter.toWireType('status')).toBe('STATUS');
      expect(converter.toWireType('artifact')).toBe('ARTIFACT');
      expect(converter.toWireType('cancel')).toBe('CANCEL');
    });

    it('fromWireType converts from SCREAMING_SNAKE', () => {
      expect(converter.fromWireType('TASK')).toBe('task');
      expect(converter.fromWireType('STATUS')).toBe('status');
      expect(converter.fromWireType('ARTIFACT')).toBe('artifact');
      expect(converter.fromWireType('CANCEL')).toBe('cancel');
    });

    it('roundtrip wire conversion is lossless', () => {
      const types: A2ATaskMessage['type'][] = ['task', 'status', 'artifact', 'cancel'];
      for (const t of types) {
        expect(converter.fromWireType(converter.toWireType(t))).toBe(t);
      }
    });
  });
});
