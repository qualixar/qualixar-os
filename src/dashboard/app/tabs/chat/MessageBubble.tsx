/**
 * Qualixar OS Phase 14 -- MessageBubble (World-Class)
 * Parts-based ChatMessage renderer with code blocks (language label + copy),
 * image preview, file chips, token/cost/latency chips, HitL approval cards,
 * and improved markdown (tables, links, ordered lists).
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Copy, Check, FileText, ShieldCheck, ShieldX, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import type { ChatMessage, MessagePart, FileAttachment, HitLRequest } from '../../store.js';
import { ThinkingBlock } from './ThinkingBlock.js';
import { ToolCallCard } from './ToolCallCard.js';

interface MessageBubbleProps {
  readonly message: ChatMessage;
  readonly onHitlAction?: (requestId: string, action: 'approve' | 'reject') => void;
  readonly onRetry?: (messageId: string) => void;
}

const MONO = "'SF Mono',Consolas,monospace";

/* -- Copy Button --------------------------------------------------- */
function CopyButton({ text }: { readonly text: string }): React.ReactElement {
  const [ok, setOk] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 2000); });
  }, [text]);
  return (
    <button onClick={copy} title="Copy" style={{
      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
      color: ok ? 'var(--success)' : 'var(--text-muted)', display: 'flex', alignItems: 'center',
    }}>
      {ok ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

/* -- Markdown ------------------------------------------------------ */
interface CodeBlock { readonly lang: string; readonly code: string }
const PH = '___CB___';

function renderMarkdown(text: string): { html: string; codeBlocks: CodeBlock[] } {
  const codeBlocks: CodeBlock[] = [];
  let s = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l: string, c: string) => {
    codeBlocks.push({ lang: l || 'text', code: c.replace(/\n$/, '') });
    return PH;
  });
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // inline code
  s = s.replace(/`([^`]+)`/g, `<code style="background:var(--border-glass);padding:1px 5px;border-radius:3px;font-size:0.85em;font-family:${MONO}">$1</code>`);
  // bold/italic
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // headers
  s = s.replace(/^### (.+)$/gm, '<h4 style="margin:10px 0 4px;font-size:0.9em;font-weight:600">$1</h4>');
  s = s.replace(/^## (.+)$/gm, '<h3 style="margin:10px 0 4px;font-size:0.95em;font-weight:600">$1</h3>');
  s = s.replace(/^# (.+)$/gm, '<h2 style="margin:10px 0 4px;font-size:1em;font-weight:700">$1</h2>');
  // lists
  s = s.replace(/^- (.+)$/gm, '<li style="margin-left:16px;list-style:disc">$1</li>');
  s = s.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:16px;list-style:decimal">$1</li>');
  // links
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">$1</a>');
  s = s.replace(/(^|[^"=])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">$2</a>');
  // tables
  s = s.replace(/^(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/gm, (_, hdr: string, _sep: string, body: string) => {
    const th = hdr.split('|').filter((c: string) => c.trim()).map((h: string) =>
      `<th style="padding:4px 8px;border:1px solid var(--border-glass);font-size:12px;font-weight:600">${h.trim()}</th>`).join('');
    const tr = body.trim().split('\n').map((r: string) =>
      '<tr>' + r.split('|').filter((c: string) => c.trim()).map((c: string) =>
        `<td style="padding:4px 8px;border:1px solid var(--border-glass);font-size:12px">${c.trim()}</td>`).join('') + '</tr>').join('');
    return `<table style="border-collapse:collapse;margin:6px 0;width:100%"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
  });
  s = s.replace(/\n/g, '<br/>');
  return { html: s, codeBlocks };
}

/* -- Code Block View ----------------------------------------------- */
function CodeBlockView({ lang, code }: CodeBlock): React.ReactElement {
  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-glass)', margin: '6px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-glass)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{lang}</span>
        <CopyButton text={code} />
      </div>
      <pre style={{ margin: 0, padding: '10px 12px', background: 'var(--bg-primary)', fontSize: 12, lineHeight: 1.6, overflowX: 'auto', color: 'var(--text-primary)', fontFamily: MONO }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* -- Text Part ----------------------------------------------------- */
function TextPart({ text }: { readonly text: string }): React.ReactElement {
  const { html, codeBlocks } = useMemo(() => renderMarkdown(text), [text]);
  const parts = html.split(PH);
  return (
    <div style={{ lineHeight: 1.7, fontSize: 14 }}>
      {parts.map((frag, i) => (
        <React.Fragment key={i}>
          {frag && <span dangerouslySetInnerHTML={{ __html: frag }} />}
          {i < codeBlocks.length && <CodeBlockView lang={codeBlocks[i].lang} code={codeBlocks[i].code} />}
        </React.Fragment>
      ))}
    </div>
  );
}

/* -- Image Preview ------------------------------------------------- */
function ImagePreview({ attachment }: { readonly attachment: FileAttachment }): React.ReactElement {
  return (
    <div style={{ margin: '6px 0' }}>
      <img src={attachment.url ?? attachment.thumbnailUrl ?? ''} alt={attachment.name}
        style={{ maxWidth: 300, maxHeight: 200, borderRadius: 8, display: 'block', border: '1px solid var(--border-glass)', objectFit: 'contain' }} />
      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>{attachment.name}</span>
    </div>
  );
}

/* -- File Chip ----------------------------------------------------- */
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

function FileChip({ attachment }: { readonly attachment: FileAttachment }): React.ReactElement {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, margin: '4px 4px 4px 0', background: 'var(--bg-primary)', border: '1px solid var(--border-glass)', fontSize: 12, color: 'var(--text-secondary)', maxWidth: 260 }}>
      <FileText size={14} style={{ flexShrink: 0, color: 'var(--accent)' }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{attachment.name}</span>
      {attachment.size > 0 && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{fmtBytes(attachment.size)}</span>}
    </div>
  );
}

/* -- HitL Approval Card -------------------------------------------- */
const RISK: Record<string, { bg: string; fg: string }> = {
  low: { bg: 'var(--success-soft)', fg: 'var(--success)' },
  medium: { bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  high: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
};

function HitLCard({ request, onAction }: {
  readonly request: HitLRequest;
  readonly onAction?: (id: string, action: 'approve' | 'reject') => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const risk = RISK[request.riskLevel] ?? RISK.medium;
  const pending = request.status === 'pending';
  const statusIcon = request.status === 'approved'
    ? <ShieldCheck size={16} style={{ color: 'var(--success)' }} />
    : request.status === 'rejected'
      ? <ShieldX size={16} style={{ color: 'var(--danger)' }} />
      : <ShieldCheck size={16} style={{ color: 'var(--warning)' }} />;

  const statusColor = pending ? 'var(--warning)' : request.status === 'approved' ? 'var(--success)' : 'var(--danger)';

  return (
    <div style={{ border: '1px solid var(--border-glass-hover)', borderRadius: 8, margin: '6px 0', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
        {statusIcon}
        <span style={{ fontWeight: 600, fontSize: 13 }}>{request.toolName}</span>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: risk.bg, color: risk.fg, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{request.riskLevel}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 500, color: statusColor }}>{request.status}</span>
      </div>
      <button onClick={() => setOpen((p) => !p)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', background: 'none', border: 'none', borderTop: '1px solid var(--border-glass)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>Tool Input</span>
      </button>
      {open && (
        <pre style={{ margin: 0, padding: '8px 12px', fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', borderTop: '1px solid var(--border-glass)', background: 'var(--bg-tertiary)', fontFamily: MONO }}>
          {JSON.stringify(request.toolInput, null, 2)}
        </pre>
      )}
      {pending && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--border-glass)' }}>
          <button onClick={() => onAction?.(request.id, 'approve')} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--success)', color: '#fff', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <ShieldCheck size={14} /> Approve
          </button>
          <button onClick={() => onAction?.(request.id, 'reject')} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--danger)', color: '#fff', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <ShieldX size={14} /> Reject
          </button>
        </div>
      )}
    </div>
  );
}

/* -- Metadata Chips ------------------------------------------------ */
function fmtTokens(n: number): string { return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n); }

function MetadataChips({ message }: { readonly message: ChatMessage }): React.ReactElement | null {
  const chips: string[] = [];
  if (message.inputTokens != null) chips.push(`${fmtTokens(message.inputTokens)} in`);
  if (message.outputTokens != null) chips.push(`${fmtTokens(message.outputTokens)} out`);
  if (message.cost != null && message.cost > 0) chips.push(`$${message.cost.toFixed(4)}`);
  if (message.latencyMs != null) chips.push(`${(message.latencyMs / 1000).toFixed(1)}s`);
  if (chips.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {chips.map((c) => (
        <span key={c} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-muted)', border: '1px solid var(--border-glass)', fontFamily: MONO }}>{c}</span>
      ))}
    </div>
  );
}

/* -- Part Renderer ------------------------------------------------- */
function renderPart(part: MessagePart, idx: number, onHitl?: (id: string, a: 'approve' | 'reject') => void): React.ReactElement {
  switch (part.type) {
    case 'text':
      return <TextPart key={idx} text={part.text} />;
    case 'reasoning':
      return <ThinkingBlock key={idx} text={part.text} durationMs={part.durationMs} />;
    case 'tool-call':
      return <ToolCallCard key={idx} call={part.call} />;
    case 'tool-result':
      return (
        <div key={idx} style={{ fontSize: 12, color: 'var(--text-secondary)', borderLeft: '2px solid var(--border-glass)', paddingLeft: 8, marginTop: 4 }}>
          <span style={{ fontWeight: 600 }}>Result:</span>{' '}
          <span>{typeof part.result === 'string' ? part.result : JSON.stringify(part.result)}</span>
        </div>
      );
    case 'error':
      return (
        <div key={idx} style={{ color: 'var(--danger)', fontSize: 13, padding: '6px 10px', background: 'var(--danger-soft)', borderRadius: 6, marginTop: 4 }}>
          {part.code ? `[${part.code}] ` : ''}{part.message}
        </div>
      );
    case 'image':
      return <ImagePreview key={idx} attachment={part.attachment} />;
    case 'file':
      return part.attachment.type.startsWith('image/')
        ? <ImagePreview key={idx} attachment={part.attachment} />
        : <FileChip key={idx} attachment={part.attachment} />;
    case 'hitl-request':
      return <HitLCard key={idx} request={part.request} onAction={onHitl} />;
  }
}

/* -- Bubble Styles ------------------------------------------------- */
const BUBBLE: Record<string, React.CSSProperties> = {
  user: { alignSelf: 'flex-end', background: 'var(--accent-soft)', borderRadius: '16px 16px 4px 16px', maxWidth: '80%' },
  assistant: { alignSelf: 'flex-start', background: 'var(--bg-tertiary)', borderRadius: '16px 16px 16px 4px', maxWidth: '80%' },
  system: { alignSelf: 'center', background: 'var(--bg-tertiary)', borderRadius: 8, maxWidth: '90%', opacity: 0.7, fontSize: 12 },
};

/* -- MessageBubble ------------------------------------------------- */
export function MessageBubble({ message, onHitlAction, onRetry }: MessageBubbleProps): React.ReactElement {
  const style = BUBBLE[message.role] ?? BUBBLE.assistant;
  const isError = message.status === 'error';
  const time = useMemo(() => {
    try { return new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }, [message.timestamp]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', ...style, padding: '10px 14px', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {message.parts.map((p, i) => renderPart(p, i, onHitlAction))}
      </div>
      {message.role === 'assistant' && <MetadataChips message={message} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 10, color: 'var(--text-muted)', gap: 8 }}>
        <span>{time}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isError && onRetry && (
            <button
              onClick={() => onRetry(message.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px',
                borderRadius: 4, border: '1px solid var(--border-glass)',
                background: 'transparent', color: 'var(--warning, #f59e0b)',
                cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              <RotateCcw size={10} /> Retry
            </button>
          )}
          {message.model && <span style={{ fontFamily: MONO }}>{message.model}</span>}
        </div>
      </div>
    </div>
  );
}
