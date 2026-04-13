/**
 * Qualixar OS — ChatPanel (Session 10 Upgrade)
 * Right panel: message list, streaming indicator, drag-and-drop overlay, input bar.
 * Supports file drop, model/topology selection passed through to ChatInput.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Upload, ArrowDown } from 'lucide-react';
import type { ChatMessage, StreamingState, ModelEntry } from '../../types.js';
import { MessageBubble } from './MessageBubble.js';
import { ChatInput } from './ChatInput.js';
import type { FileAttachment } from './ChatInput.js';
import { ThinkingBlock } from './ThinkingBlock.js';
import { ToolCallCard } from './ToolCallCard.js';

export type { FileAttachment } from './ChatInput.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface ChatPanelProps {
  readonly messages: readonly ChatMessage[];
  readonly streamingState: StreamingState | null;
  readonly conversationId: string | null;
  readonly onSend: (text: string, attachments: FileAttachment[], model?: string, topology?: string) => void;
  readonly onStop?: () => void;
  readonly models: readonly ModelEntry[];
  readonly selectedModel: string | null;
  readonly onModelChange: (model: string | null) => void;
  readonly onRetry?: (messageId: string) => void;
  readonly onApproveHitL?: (requestId: string) => void;
  readonly onRejectHitL?: (requestId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ChatPanel({
  messages, streamingState, conversationId, onSend, onStop,
  models, selectedModel, onModelChange,
  onRetry, onApproveHitL, onRejectHitL,
}: ChatPanelProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<FileAttachment[]>([]);
  const isStreaming = streamingState != null;

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, []);

  // Auto-scroll on new messages or streaming
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom) scrollToBottom();
  }, [messages.length, streamingState?.currentText, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  }, []);

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const attachments: FileAttachment[] = files.map((f) => ({
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: f.name,
      type: f.type,
      size: f.size,
      url: URL.createObjectURL(f),
    }));
    setDroppedFiles((prev) => [...prev, ...attachments]);
  }, []);

  // Handle send with accumulated dropped files
  const handleSend = useCallback((text: string, inputAttachments: FileAttachment[], model?: string, topology?: string) => {
    const allAttachments = [...droppedFiles, ...inputAttachments];
    onSend(text, allAttachments, model, topology);
    setDroppedFiles([]);
  }, [droppedFiles, onSend]);

  const removeDroppedFile = useCallback((id: string) => {
    setDroppedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Streaming preview
  const streamingPreview = useMemo((): React.ReactElement | null => {
    if (!streamingState) return null;
    return (
      <div style={{
        alignSelf: 'flex-start', background: 'var(--bg-tertiary)', borderRadius: '16px 16px 16px 4px',
        maxWidth: '80%', padding: '10px 14px', color: 'var(--text-primary)',
      }}>
        {streamingState.currentThinking && <ThinkingBlock text={streamingState.currentThinking} />}
        {streamingState.activeTool && <ToolCallCard call={streamingState.activeTool} />}
        {streamingState.currentText && <div style={{ lineHeight: 1.6 }}>{streamingState.currentText}</div>}
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s infinite' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {streamingState.status === 'thinking' ? 'Thinking...' :
             streamingState.status === 'tool_calling' ? 'Calling tool...' : 'Streaming...'}
          </span>
        </div>
      </div>
    );
  }, [streamingState]);

  // Empty state
  if (!conversationId) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', gap: 12,
      }}>
        <Upload size={40} strokeWidth={1.2} style={{ opacity: 0.4 }} />
        <span style={{ fontSize: 15 }}>Select or create a conversation to start chatting</span>
        <span style={{ fontSize: 12, opacity: 0.6 }}>Drop files here to attach them to your message</span>
      </div>
    );
  }

  return (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          background: 'var(--accent-soft)', border: '2px dashed var(--accent)',
          borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ textAlign: 'center', color: 'var(--accent)' }}>
            <Upload size={36} />
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>Drop files to attach</div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1, overflowY: 'auto', padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        {messages.length === 0 && !isStreaming && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40, fontSize: 14 }}>
            Start the conversation by sending a message below
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onRetry={onRetry}
            onHitlAction={(requestId, action) => {
              if (action === 'approve') onApproveHitL?.(requestId);
              else onRejectHitL?.(requestId);
            }}
          />
        ))}
        {streamingPreview}
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          style={{
            position: 'absolute', bottom: 80, right: 24,
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--bg-tertiary)', border: '1px solid var(--border-glass)',
            color: 'var(--text-primary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-md)',
          }}
          aria-label="Scroll to bottom"
        >
          <ArrowDown size={16} />
        </button>
      )}

      {/* Dropped files indicator */}
      {droppedFiles.length > 0 && (
        <div style={{
          padding: '6px 16px', display: 'flex', gap: 6, flexWrap: 'wrap',
          borderTop: '1px solid var(--border-glass)', background: 'var(--bg-secondary)',
        }}>
          {droppedFiles.map((f) => (
            <span key={f.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 12, fontSize: 11,
              background: 'var(--accent-soft)', color: 'var(--accent)',
              border: '1px solid var(--border-glass)',
            }}>
              {f.name.length > 20 ? f.name.slice(0, 18) + '...' : f.name}
              <button
                onClick={() => removeDroppedFile(f.id)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 0 }}
                aria-label={`Remove ${f.name}`}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input bar */}
      <ChatInput
        onSend={handleSend}
        onStop={onStop}
        disabled={isStreaming}
        models={models}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
      />
    </div>
  );
}
