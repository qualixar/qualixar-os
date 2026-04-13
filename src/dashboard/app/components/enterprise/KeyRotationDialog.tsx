/**
 * Qualixar OS Phase 22 Enterprise — KeyRotationDialog
 * Modal for rotating the vault passphrase.
 * Validates old passphrase, enforces new passphrase strength, and confirms match.
 */

import React, { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { springSnappy } from '../../lib/motion-presets.js';
import { GlassModal } from '../shared.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KeyRotationDialogProps {
  readonly onRotate: (oldPass: string, newPass: string) => Promise<void>;
  readonly onClose: () => void;
}

// ---------------------------------------------------------------------------
// Strength scorer (0-4)
// ---------------------------------------------------------------------------

function scorePassphrase(p: string): number {
  let score = 0;
  if (p.length >= 12) score++;
  if (p.length >= 20) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  return Math.min(score, 4);
}

const STRENGTH_LABELS = ['Weak', 'Fair', 'Good', 'Strong', 'Excellent'] as const;
const STRENGTH_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6'] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KeyRotationDialog({ onRotate, onClose }: KeyRotationDialogProps): React.ReactElement {
  const [oldPass, setOldPass]     = useState('');
  const [newPass, setNewPass]     = useState('');
  const [confirmPass, setConfirm] = useState('');
  const [rotating, setRotating]   = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const strength = scorePassphrase(newPass);
  const mismatch = confirmPass.length > 0 && newPass !== confirmPass;
  const canRotate = oldPass.length > 0 && newPass.length >= 8 && newPass === confirmPass && !rotating;

  const handleRotate = useCallback(async () => {
    if (!canRotate) return;
    setError(null);
    setRotating(true);
    try {
      await onRotate(oldPass, newPass);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rotation failed. Check your old passphrase.');
    } finally {
      setRotating(false);
    }
  }, [canRotate, oldPass, newPass, onRotate, onClose]);

  return (
    <GlassModal isOpen onClose={onClose} maxWidth={480}>
      <div style={{ padding: '24px' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem' }}>Rotate Vault Passphrase</h3>
        <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Enter your current passphrase and set a new one. All encrypted credentials will be re-wrapped.
        </p>

        {/* Old passphrase */}
        <label className="field-label">Current Passphrase</label>
        <input
          type="password"
          className="glass-input"
          placeholder="Current passphrase"
          value={oldPass}
          onChange={(e) => setOldPass(e.target.value)}
          style={{ width: '100%', marginBottom: '14px' }}
          autoComplete="current-password"
        />

        {/* New passphrase */}
        <label className="field-label">New Passphrase</label>
        <input
          type="password"
          className="glass-input"
          placeholder="Min 8 characters"
          value={newPass}
          onChange={(e) => setNewPass(e.target.value)}
          style={{ width: '100%', marginBottom: '6px' }}
          autoComplete="new-password"
        />

        {/* Strength bar */}
        {newPass.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={springSnappy}
            style={{ marginBottom: '12px' }}
          >
            <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: '4px',
                    borderRadius: '2px',
                    background: i < strength ? STRENGTH_COLORS[strength] : 'var(--bg-tertiary)',
                    transition: 'background 0.3s',
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: '0.72rem', color: STRENGTH_COLORS[strength] }}>
              {STRENGTH_LABELS[strength]}
            </span>
          </motion.div>
        )}

        {/* Confirm */}
        <label className="field-label">Confirm New Passphrase</label>
        <input
          type="password"
          className="glass-input"
          placeholder="Repeat new passphrase"
          value={confirmPass}
          onChange={(e) => setConfirm(e.target.value)}
          style={{ width: '100%', marginBottom: '4px', borderColor: mismatch ? '#ef4444' : undefined }}
          autoComplete="new-password"
        />
        {mismatch && (
          <p style={{ margin: '0 0 10px', fontSize: '0.75rem', color: '#ef4444' }}>Passphrases do not match.</p>
        )}

        {error && (
          <p style={{ margin: '10px 0', fontSize: '0.8rem', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: '6px' }}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={rotating}>Cancel</button>
          <button
            className="btn btn-danger"
            onClick={() => { void handleRotate(); }}
            disabled={!canRotate}
          >
            {rotating ? 'Rotating…' : 'Rotate Passphrase'}
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
