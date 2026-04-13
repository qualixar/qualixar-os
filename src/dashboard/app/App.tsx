/**
 * Qualixar OS Dashboard App Root — Premium Edition
 * React 19 + Motion 12 + Glassmorphism 2.0 + Lucide Icons
 * 21-domain command center with animated transitions.
 */

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { LazyMotion, domAnimation, motion, AnimatePresence } from 'motion/react';
import { useDashboardStore } from './store.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { StatusBadge, LoadingSpinner } from './components/shared.js';
import { ThemeToggle } from './components/ThemeToggle.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { tabContent, springGentle } from './lib/motion-presets.js';
import { OverviewTab } from './tabs/OverviewTab.js';
import { AgentsTab } from './tabs/AgentsTab.js';
import { JudgesTab } from './tabs/JudgesTab.js';
import { CostTab } from './tabs/CostTab.js';
import { SwarmsTab } from './tabs/SwarmsTab.js';
import { ForgeTab } from './tabs/ForgeTab.js';
import { MemoryTab } from './tabs/MemoryTab.js';
import { PipelinesTab } from './tabs/PipelinesTab.js';
import { ToolsTab } from './tabs/ToolsTab.js';
import { SettingsTab } from './tabs/SettingsTab.js';
import {
  LayoutDashboard, Bot, Scale, DollarSign, Zap, Hammer, HardDrive,
  GitBranch, Wrench, Settings, MessageSquare, FlaskConical, BarChart3,
  Workflow, Plug, FileText, ShieldCheck, Database, Compass,
  LayoutTemplate, Sparkles, Store, PenTool, ClipboardList,
} from 'lucide-react';

// Phase 14: Lazy-loaded new tabs (code splitting)
const ChatTab = React.lazy(() => import('./tabs/ChatTab.js'));
const LabTab = React.lazy(() => import('./tabs/LabTab.js'));
const TracesTab = React.lazy(() => import('./tabs/TracesTab.js'));
const FlowsTab = React.lazy(() => import('./tabs/FlowsTab.js'));

// Phase 15: Lazy-loaded new tabs
const ConnectorsTab = React.lazy(() => import('./tabs/ConnectorsTab.js'));
const LogsTab = React.lazy(() => import('./tabs/LogsTab.js'));
const GateTab = React.lazy(() => import('./tabs/GateTab.js'));
const DatasetsTab = React.lazy(() => import('./tabs/DatasetsTab.js'));

// Phase 16: Lazy-loaded final tabs
const VectorsTab = React.lazy(() => import('./tabs/VectorsTab.js'));
const BlueprintsTab = React.lazy(() => import('./tabs/BlueprintsTab.js'));
const BrainTab = React.lazy(() => import('./tabs/BrainTab.js'));
// Phase 20-22: Marketplace, Builder, Audit
const MarketplaceTab = React.lazy(() => import('./tabs/MarketplaceTab.js'));
const BuilderTab = React.lazy(() => import('./tabs/BuilderTab.js'));
const AuditTab = React.lazy(() => import('./tabs/AuditTab.js'));

// ---------------------------------------------------------------------------
// Tab Configuration — Lucide SVG Icons
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
  { id: 'agents', label: 'Agents', Icon: Bot },
  { id: 'judges', label: 'Judges', Icon: Scale },
  { id: 'cost', label: 'Cost', Icon: DollarSign },
  { id: 'swarms', label: 'Swarms', Icon: Zap },
  { id: 'forge', label: 'Forge', Icon: Hammer },
  { id: 'memory', label: 'Memory', Icon: HardDrive },
  { id: 'pipelines', label: 'Pipelines', Icon: GitBranch },
  { id: 'tools', label: 'Tools', Icon: Wrench },
  { id: 'lab', label: 'Lab', Icon: FlaskConical },
  { id: 'traces', label: 'Traces', Icon: BarChart3 },
  { id: 'flows', label: 'Flows', Icon: Workflow },
  { id: 'connectors', label: 'Connectors', Icon: Plug },
  { id: 'logs', label: 'Logs', Icon: FileText },
  { id: 'gate', label: 'Gate', Icon: ShieldCheck },
  { id: 'datasets', label: 'Datasets', Icon: Database },
  { id: 'vectors', label: 'Vectors', Icon: Compass },
  { id: 'blueprints', label: 'Blueprints', Icon: LayoutTemplate },
  { id: 'brain', label: 'Brain', Icon: Sparkles },
  { id: 'marketplace', label: 'Marketplace', Icon: Store },
  { id: 'builder', label: 'Builder', Icon: PenTool },
  { id: 'audit', label: 'Audit', Icon: ClipboardList },
  { id: 'settings', label: 'Settings', Icon: Settings },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ---------------------------------------------------------------------------
// Tab Content Router
// ---------------------------------------------------------------------------

function TabContent({ tabId }: { readonly tabId: TabId }): React.ReactElement {
  switch (tabId) {
    case 'overview': return <ErrorBoundary tabName="Overview"><OverviewTab /></ErrorBoundary>;
    case 'agents': return <ErrorBoundary tabName="Agents"><AgentsTab /></ErrorBoundary>;
    case 'judges': return <ErrorBoundary tabName="Judges"><JudgesTab /></ErrorBoundary>;
    case 'cost': return <ErrorBoundary tabName="Cost"><CostTab /></ErrorBoundary>;
    case 'swarms': return <ErrorBoundary tabName="Swarms"><SwarmsTab /></ErrorBoundary>;
    case 'forge': return <ErrorBoundary tabName="Forge"><ForgeTab /></ErrorBoundary>;
    case 'memory': return <ErrorBoundary tabName="Memory"><MemoryTab /></ErrorBoundary>;
    case 'pipelines': return <ErrorBoundary tabName="Pipelines"><PipelinesTab /></ErrorBoundary>;
    case 'tools': return <ErrorBoundary tabName="Tools"><ToolsTab /></ErrorBoundary>;
    case 'settings': return <ErrorBoundary tabName="Settings"><SettingsTab /></ErrorBoundary>;
    // Phase 14: Lazy-loaded tabs with Suspense
    case 'chat': return <ErrorBoundary tabName="Chat"><Suspense fallback={<LoadingSpinner />}><ChatTab /></Suspense></ErrorBoundary>;
    case 'lab': return <ErrorBoundary tabName="Lab"><Suspense fallback={<LoadingSpinner />}><LabTab /></Suspense></ErrorBoundary>;
    case 'traces': return <ErrorBoundary tabName="Traces"><Suspense fallback={<LoadingSpinner />}><TracesTab /></Suspense></ErrorBoundary>;
    case 'flows': return <ErrorBoundary tabName="Flows"><Suspense fallback={<LoadingSpinner />}><FlowsTab /></Suspense></ErrorBoundary>;
    // Phase 15
    case 'connectors': return <ErrorBoundary tabName="Connectors"><Suspense fallback={<LoadingSpinner />}><ConnectorsTab /></Suspense></ErrorBoundary>;
    case 'logs': return <ErrorBoundary tabName="Logs"><Suspense fallback={<LoadingSpinner />}><LogsTab /></Suspense></ErrorBoundary>;
    case 'gate': return <ErrorBoundary tabName="Gate"><Suspense fallback={<LoadingSpinner />}><GateTab /></Suspense></ErrorBoundary>;
    case 'datasets': return <ErrorBoundary tabName="Datasets"><Suspense fallback={<LoadingSpinner />}><DatasetsTab /></Suspense></ErrorBoundary>;
    // Phase 16
    case 'vectors': return <ErrorBoundary tabName="Vectors"><Suspense fallback={<LoadingSpinner />}><VectorsTab /></Suspense></ErrorBoundary>;
    case 'blueprints': return <ErrorBoundary tabName="Blueprints"><Suspense fallback={<LoadingSpinner />}><BlueprintsTab /></Suspense></ErrorBoundary>;
    case 'brain': return <ErrorBoundary tabName="Brain"><Suspense fallback={<LoadingSpinner />}><BrainTab /></Suspense></ErrorBoundary>;
    // Phase 20-22
    case 'marketplace': return <ErrorBoundary tabName="Marketplace"><Suspense fallback={<LoadingSpinner />}><MarketplaceTab /></Suspense></ErrorBoundary>;
    case 'builder': return <ErrorBoundary tabName="Builder"><Suspense fallback={<LoadingSpinner />}><BuilderTab /></Suspense></ErrorBoundary>;
    case 'audit': return <ErrorBoundary tabName="Audit"><Suspense fallback={<LoadingSpinner />}><AuditTab /></Suspense></ErrorBoundary>;
  }
}

// ---------------------------------------------------------------------------
// Mode Toggle (header widget)
// ---------------------------------------------------------------------------

function ModeToggle(): React.ReactElement {
  const systemConfig = useDashboardStore((s) => s.systemConfig);
  const updateConfig = useDashboardStore((s) => s.updateConfig);

  const currentMode = (systemConfig.mode as string) ?? 'companion';

  const toggle = useCallback(() => {
    const next = currentMode === 'companion' ? 'power' : 'companion';
    updateConfig({ mode: next });
  }, [currentMode, updateConfig]);

  return (
    <button
      className={`header-mode-toggle ${currentMode === 'power' ? 'mode-power' : 'mode-companion'}`}
      onClick={toggle}
      title={`Current mode: ${currentMode}. Click to switch.`}
    >
      {currentMode === 'power' ? 'POWER' : 'COMPANION'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Qualixar Logo (header branding)
// ---------------------------------------------------------------------------

function QualixarLogo(): React.ReactElement {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" width={32} height={32} aria-label="Qualixar">
      <circle cx="24" cy="20" r="14" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.15" />
      <path d="M19 8 L19 22 Q19 26 24 26 Q29 26 29 22 L29 8" stroke="#3B82F6" strokeWidth="2.8" strokeLinecap="round" fill="none" />
      <line x1="24" y1="26" x2="24" y2="40" stroke="#3B82F6" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M13 14 Q11 20 13 26" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.4" />
      <path d="M10 12 Q7 20 10 28" stroke="#3B82F6" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.2" />
      <path d="M35 14 Q37 20 35 26" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.4" />
      <path d="M38 12 Q41 20 38 28" stroke="#3B82F6" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.2" />
      <line x1="30" y1="30" x2="36" y2="38" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function AppFooter(): React.ReactElement {
  return (
    <footer className="app-footer">
      <div className="footer-left">
        <QualixarLogo />
        <span className="footer-brand">Qualixar OS</span>
        <span className="footer-sep">&middot;</span>
        <span className="footer-tagline">Universal Agent Operating System</span>
      </div>
      <div className="footer-center">
        <a href="https://qualixar.com" target="_blank" rel="noopener noreferrer" className="footer-link">qualixar.com</a>
        <span className="footer-sep">&middot;</span>
        <a href="https://github.com/qualixar/qualixar-os" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
        <span className="footer-sep">&middot;</span>
        <a href="https://www.npmjs.com/package/qualixar-os" target="_blank" rel="noopener noreferrer" className="footer-link">npm</a>
      </div>
      <div className="footer-right">
        A research initiative by <strong>Varun Pratap Bhardwaj</strong>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// App Component
// ---------------------------------------------------------------------------

const WS_URL = `ws://${typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}/ws`;

export function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const saved = localStorage.getItem('qos-active-tab');
    return (saved && TABS.some((t) => t.id === saved) ? saved : 'overview') as TabId;
  });

  // Persist active tab to localStorage
  useEffect(() => {
    localStorage.setItem('qos-active-tab', activeTab);
  }, [activeTab]);
  const wsStatus = useDashboardStore((s) => s.wsStatus);
  const taskCount = useDashboardStore((s) => s.tasks.length);
  const activeTasks = useDashboardStore((s) =>
    s.tasks.filter((t) => t.status === 'running' || t.status === 'pending').length,
  );
  const totalCost = useDashboardStore((s) => s.cost.total_usd);

  useWebSocket(WS_URL);

  return (
    <LazyMotion features={domAnimation} strict>
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <QualixarLogo />
          <h1 className="app-title">Qualixar OS</h1>
          <span className="header-subtitle">Command Center</span>
          <span className="task-count">{activeTasks} active / {taskCount} total</span>
          <span className="header-cost">${totalCost.toFixed(4)}</span>
        </div>
        <div className="header-right">
          <ThemeToggle />
          <ModeToggle />
          <StatusBadge
            status={wsStatus === 'connected' ? 'active' : wsStatus === 'connecting' ? 'pending' : 'error'}
            label={wsStatus}
          />
          <button
            className="header-settings-btn"
            onClick={() => setActiveTab('settings')}
            title="Open Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      <nav className="tab-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.Icon size={15} strokeWidth={activeTab === tab.id ? 2.5 : 1.8} />
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className="tab-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            variants={tabContent}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springGentle}
          >
            <TabContent tabId={activeTab} />
          </motion.div>
        </AnimatePresence>
      </main>
      <AppFooter />
    </div>
    </LazyMotion>
  );
}
