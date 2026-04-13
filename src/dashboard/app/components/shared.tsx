/**
 * Qualixar OS Dashboard — Shared Components (Premium Edition)
 * Card, StatusBadge, DataTable, Gauge, LoadingSpinner, Modal
 * Now with Motion 12 animations, 3D hover, glassmorphism 2.0.
 */

import React, { useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { springGentle, springSnappy, staggerItem, microInteractions, scaleFade, modalOverlay, modalContent } from '../lib/motion-presets.js';

// ---------------------------------------------------------------------------
// Card — Glassmorphism 2.0 + 3D Tilt on Hover
// ---------------------------------------------------------------------------

interface CardProps {
  readonly title?: string;
  readonly subtitle?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function Card({ title, subtitle, children, className }: CardProps): React.ReactElement {
  return (
    <motion.div
      className={`card glass ${className ?? ''}`}
      variants={staggerItem}
      whileHover={microInteractions.hoverLift}
      transition={springGentle}
    >
      <div className="card-header">
        <h3 className="card-title">{title}</h3>
        {subtitle && <span className="card-subtitle">{subtitle}</span>}
      </div>
      <div className="card-body">{children}</div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge — Glowing Animated Dot
// ---------------------------------------------------------------------------

interface StatusBadgeProps {
  readonly status: 'active' | 'pending' | 'error' | 'completed' | 'idle';
  readonly label: string;
}

const STATUS_COLORS: Record<StatusBadgeProps['status'], string> = {
  active: '#22c55e',
  pending: '#f59e0b',
  error: '#ef4444',
  completed: '#3b82f6',
  idle: '#6b7280',
};

export function StatusBadge({ status, label }: StatusBadgeProps): React.ReactElement {
  return (
    <motion.span
      className="status-badge"
      style={{
        backgroundColor: `${STATUS_COLORS[status]}15`,
        color: STATUS_COLORS[status],
        borderColor: `${STATUS_COLORS[status]}40`,
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springSnappy}
    >
      <span className="status-dot" style={{ backgroundColor: STATUS_COLORS[status] }} />
      {label}
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// DataTable — Clean with Animated Rows
// ---------------------------------------------------------------------------

export interface DataTableColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  readonly columns: readonly DataTableColumn<T>[];
  readonly data: readonly T[];
  readonly emptyMessage?: string;
  readonly onRowClick?: (row: T, index: number) => void;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  emptyMessage = 'No data available',
  onRowClick,
}: DataTableProps<T>): React.ReactElement {
  if (data.length === 0) {
    return (
      <motion.div
        className="table-empty"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={springGentle}
      >
        {emptyMessage}
      </motion.div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className={`data-table${onRowClick ? ' clickable-rows' : ''}`}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <motion.tr
              key={String(row['id'] ?? row['taskId'] ?? row['agentId'] ?? idx)}
              onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...springGentle, delay: Math.min(idx * 0.03, 0.3) }}
            >
              {columns.map((col) => (
                <td key={col.key}>
                  {col.render ? col.render(row) : String(row[col.key] ?? '')}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gauge — Animated Arc
// ---------------------------------------------------------------------------

interface GaugeProps {
  readonly value: number;
  readonly max: number;
  readonly label: string;
  readonly unit?: string;
  readonly size?: number;
}

export function Gauge({
  value,
  max,
  label,
  unit = '',
  size = 120,
}: GaugeProps): React.ReactElement {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const color = pct > 0.9 ? '#ef4444' : pct > 0.7 ? '#f59e0b' : '#22c55e';

  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="gauge-svg">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--bg-tertiary)" strokeWidth={8}
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={circumference}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={springGentle}
        />
      </svg>
      <div className="gauge-label">
        <motion.span
          className="gauge-value"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {value.toFixed(2)}{unit}
        </motion.span>
        <span className="gauge-text">{label}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoadingSpinner — Smooth Fade-In
// ---------------------------------------------------------------------------

interface LoadingSpinnerProps {
  readonly message?: string;
}

export function LoadingSpinner({ message = 'Loading...' }: LoadingSpinnerProps): React.ReactElement {
  return (
    <motion.div
      className="loading-spinner"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={springGentle}
    >
      <div className="spinner" />
      <span>{message}</span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// GlassModal — Animated Overlay + Content
// ---------------------------------------------------------------------------

interface GlassModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
  readonly maxWidth?: number;
}

export function GlassModal({ isOpen, onClose, children, maxWidth = 700 }: GlassModalProps): React.ReactElement {
  // Global Escape key handler — works without focus on the overlay
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isOpen, onClose]);

  // Portal to document.body to escape motion.div transform containing block
  return ReactDOM.createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          variants={modalOverlay}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={springGentle}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="modal-content glass-heavy"
            variants={modalContent}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springSnappy}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth, width: '92%' }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
