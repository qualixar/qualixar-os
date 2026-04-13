// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 7 -- useWebSocket Hook
 * LLD Section 2.3
 *
 * Custom React hook: WebSocket connection with exponential backoff reconnect.
 * On connect: stops REST polling (WS is real-time).
 * On disconnect: starts REST polling at 3s interval as fallback.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useDashboardStore } from '../store.js';

const INITIAL_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30_000;
const POLL_FAST_MS = 3000;   // Fast poll for active data
const POLL_SLOW_MS = 10_000; // Slow poll for stable data

export function useWebSocket(url: string): void {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollFastRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollSlowRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleWsEvent = useDashboardStore((s) => s.handleWsEvent);
  const updateWsStatus = useDashboardStore((s) => s.updateWsStatus);
  const addLog = useDashboardStore((s) => s.addLog);

  const startPolling = useCallback(() => {
    if (pollFastRef.current) return; // already polling

    const store = useDashboardStore.getState();

    // Fast poll: tasks, agents, cost, events (active data)
    pollFastRef.current = setInterval(() => {
      const s = useDashboardStore.getState();
      s.fetchTasks();
      s.fetchAgents();
      s.fetchCost();
      s.fetchEvents();
    }, POLL_FAST_MS);

    // Slow poll: judge results, forge, memory, RL (stable data)
    pollSlowRef.current = setInterval(() => {
      const s = useDashboardStore.getState();
      s.fetchJudgeResults();
      s.fetchForgeDesigns();
      s.fetchMemoryStats();
      s.fetchRLStats();
    }, POLL_SLOW_MS);

    // Immediate first fetch
    store.fetchAll();
  }, []);

  const stopPolling = useCallback(() => {
    if (pollFastRef.current) {
      clearInterval(pollFastRef.current);
      pollFastRef.current = null;
    }
    if (pollSlowRef.current) {
      clearInterval(pollSlowRef.current);
      pollSlowRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    updateWsStatus('connecting');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      updateWsStatus('connected');
      addLog('ws:connected', `Connected to ${url}`);
      reconnectDelayRef.current = INITIAL_RECONNECT_MS;
      // Stop polling when WS connected — WS is real-time
      stopPolling();
      // Immediate full fetch on connect
      useDashboardStore.getState().fetchAll();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as Record<string, unknown>;
        handleWsEvent(data);
      } catch {
        addLog('ws:parse_error', 'Failed to parse WebSocket message');
      }
    };

    ws.onclose = () => {
      updateWsStatus('reconnecting');
      addLog('ws:disconnected', 'WebSocket disconnected, falling back to REST polling');
      stopPolling();
      startPolling(); // full-speed REST polling as fallback
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_MS);
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      addLog('ws:error', 'WebSocket connection error');
    };
  }, [url, handleWsEvent, updateWsStatus, addLog, startPolling, stopPolling]);

  useEffect(() => {
    // Initial full data fetch regardless of WS status
    useDashboardStore.getState().fetchAll();

    // Attempt WebSocket connection
    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      stopPolling();
      wsRef.current?.close();
      updateWsStatus('disconnected');
    };
  }, [connect, stopPolling, updateWsStatus]);
}
