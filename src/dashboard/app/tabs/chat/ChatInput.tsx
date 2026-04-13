/**
 * Qualixar OS Phase 14 -- ChatInput (v2)
 * World-class chat input bar: file upload, model selector, topology selector,
 * auto-resizing textarea, clipboard paste, attachment chips.
 */

import React, { useState, useCallback, useRef, useId } from 'react';
import { Paperclip, Send, Square, X, Image, FileText, ChevronDown } from 'lucide-react';
import type { ModelEntry } from '../../types.js';

export interface FileAttachment {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly url?: string;
}

interface ChatInputProps {
  readonly onSend: (text: string, attachments: FileAttachment[], model?: string) => void;
  readonly onStop?: () => void;
  readonly disabled?: boolean;
  readonly models: readonly ModelEntry[];
  readonly selectedModel: string | null;
  readonly onModelChange: (model: string | null) => void;
}

const ACCEPTED_TYPES = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.md,.txt,.json,.csv,.yaml,.yml,.docx';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateName(name: string, max = 20): string {
  if (name.length <= max) return name;
  const ext = name.lastIndexOf('.');
  if (ext > 0 && name.length - ext <= 6) {
    const stem = name.slice(0, max - (name.length - ext) - 1);
    return `${stem}…${name.slice(ext)}`;
  }
  return `${name.slice(0, max - 1)}…`;
}

function DropdownButton({
  label, value, options, onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
          borderRadius: 6, border: '1px solid var(--border-glass)', background: 'transparent',
          color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
        title={label}
      >
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
        <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, minWidth: 180,
          background: 'var(--bg-secondary)', border: '1px solid var(--border-glass)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', zIndex: 100,
          maxHeight: 240, overflowY: 'auto',
        }}>
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              style={{
                display: 'block', width: '100%', padding: '7px 12px', border: 'none',
                background: o.value === value ? 'var(--accent-soft)' : 'transparent',
                color: o.value === value ? 'var(--accent)' : 'var(--text-primary)',
                fontSize: 12, textAlign: 'left', cursor: 'pointer',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentChip({ file, onRemove }: { readonly file: FileAttachment; readonly onRemove: () => void }) {
  const isImage = file.type.startsWith('image/');
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
      borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border-glass)',
      fontSize: 12, color: 'var(--text-secondary)', maxWidth: 220,
    }}>
      {isImage && file.url ? (
        <img src={file.url} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />
      ) : isImage ? (
        <Image size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      ) : (
        <FileText size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {truncateName(file.name)}
      </span>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{formatSize(file.size)}</span>
      <button
        onClick={onRemove}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, borderRadius: '50%', border: 'none',
          background: 'var(--border-glass)', color: 'var(--text-muted)', cursor: 'pointer',
          flexShrink: 0, padding: 0,
        }}
        aria-label={`Remove ${file.name}`}
      >
        <X size={11} />
      </button>
    </div>
  );
}

export function ChatInput({
  onSend, onStop, disabled = false, models, selectedModel, onModelChange,
}: ChatInputProps): React.ReactElement {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<readonly FileAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  const addFiles = useCallback((files: FileList | File[]) => {
    const newAttachments: FileAttachment[] = Array.from(files).map((f) => {
      const url = f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined;
      return { id: crypto.randomUUID(), name: f.name, type: f.type, size: f.size, url };
    });
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const item = prev.find((a) => a.id === id);
      if (item?.url) URL.revokeObjectURL(item.url);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) { addFiles(e.target.files); e.target.value = ''; }
  }, [addFiles]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items).filter((i) => i.kind === 'file');
    if (items.length === 0) return;
    const files = items.map((i) => i.getAsFile()).filter(Boolean) as File[];
    if (files.length > 0) addFiles(files);
  }, [addFiles]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || disabled) return;
    onSend(trimmed, [...attachments], selectedModel ?? undefined);
    setText('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = '40px';
  }, [text, attachments, disabled, onSend, selectedModel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = '40px';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const canSend = !disabled && (text.trim().length > 0 || attachments.length > 0);
  const modelOptions = models.map((m) => ({ value: m.name, label: `${m.provider} / ${m.name}` }));

  const modelDisplay = selectedModel ?? 'Auto';

  return (
    <div style={{
      borderTop: '1px solid var(--border-glass)',
      background: 'var(--bg-secondary)',
      backdropFilter: 'blur(12px)',
      padding: '8px 16px 12px',
    }}>
      {/* Top bar: selectors */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <DropdownButton
          label="Model" value={modelDisplay}
          options={[{ value: '__auto__', label: 'Auto (best available)' }, ...modelOptions]}
          onChange={(v) => onModelChange(v === '__auto__' ? null : v)}
        />
      </div>

      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {attachments.map((a) => (
            <AttachmentChip key={a.id} file={a} onRemove={() => removeAttachment(a.id)} />
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        {/* Paperclip */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border-glass)',
            background: 'transparent', color: 'var(--text-muted)', cursor: disabled ? 'default' : 'pointer',
            flexShrink: 0, padding: 0, opacity: disabled ? 0.5 : 1,
          }}
          aria-label="Attach file"
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileInputRef} id={fileInputId} type="file" multiple accept={ACCEPTED_TYPES}
          onChange={handleFileChange} style={{ display: 'none' }}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={disabled ? 'Waiting for response…' : 'Message Qualixar OS… (Enter to send)'}
          disabled={disabled}
          rows={1}
          style={{
            flex: 1, resize: 'none', height: 40, minHeight: 40, maxHeight: 160,
            padding: '8px 12px', borderRadius: 10,
            border: '1px solid var(--border-glass)', background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14,
            lineHeight: 1.5, outline: 'none', transition: 'border-color 0.15s',
          }}
        />

        {/* Send / Stop */}
        {disabled && onStop ? (
          <button
            onClick={onStop}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 8, border: 'none',
              background: 'var(--danger, #ef4444)', color: '#fff',
              cursor: 'pointer', flexShrink: 0, padding: 0, transition: 'background 0.15s',
            }}
            aria-label="Stop generation"
          >
            <Square size={16} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 8, border: 'none',
              background: canSend ? 'var(--accent)' : 'var(--border-glass)',
              color: canSend ? '#fff' : 'var(--text-muted)',
              cursor: canSend ? 'pointer' : 'default',
              flexShrink: 0, padding: 0, transition: 'background 0.15s',
            }}
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
