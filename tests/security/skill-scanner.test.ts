/**
 * Qualixar OS Phase 2 -- Skill Scanner Tests
 * TDD: 8 pattern categories, risk scoring, caching
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SkillScannerImpl } from '../../src/security/skill-scanner.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SkillScannerImpl', () => {
  describe('scanContent()', () => {
    it('detects child_process (shell_spawning) as critical', () => {
      const scanner = new SkillScannerImpl();
      const result = scanner.scanContent('import child_process from "child_process";');
      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.severity === 'critical')).toBe(true);
      expect(result.issues.some((i) => i.description.includes('OS command'))).toBe(true);
    });

    it('detects spawn() as critical', () => {
      const scanner = new SkillScannerImpl();
      const result = scanner.scanContent('const p = spawn("ls")');
      expect(result.safe).toBe(false);
    });

    it('detects eval() as critical', () => {
      const scanner = new SkillScannerImpl();
      const result = scanner.scanContent('const x = eval("1+1");');
      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.description.includes('Arbitrary code'))).toBe(true);
    });

    it('detects new Function() as critical', () => {
      const scanner = new SkillScannerImpl();
      const result = scanner.scanContent('const fn = new Function("return 1")');
      expect(result.safe).toBe(false);
    });

    it('detects writeFileSync as high severity', () => {
      const scanner = new SkillScannerImpl();
      const result = scanner.scanContent('fs.writeFileSync("file.txt", data)');
      expect(result.issues.some((i) => i.severity === 'high')).toBe(true);
    });

    it('detects fetch() as high severity', () => {
      const scanner = new SkillScannerImpl();
      const result = scanner.scanContent('const resp = await fetch("https://api.example.com")');
      expect(result.issues.some((i) => i.severity === 'high')).toBe(true);
    });

    it('detects axios as high severity', () => {
      const scanner = new SkillScannerImpl();
      const result = scanner.scanContent('import axios from "axios"; await axios.get("/api")');
      expect(result.issues.some((i) => i.description.includes('network'))).toBe(true);
    });

    it('detects process.env as medium severity', () => {
      const scanner = new SkillScannerImpl();
      const result = scanner.scanContent('const key = process.env.API_KEY;');
      expect(result.issues.some((i) => i.severity === 'medium')).toBe(true);
    });

    it('detects dynamic require as medium severity', () => {
      const scanner = new SkillScannerImpl();
      const result = scanner.scanContent('const mod = require(variable)');
      expect(result.issues.some((i) => i.severity === 'medium')).toBe(true);
    });

    it('detects __dirname as low severity', () => {
      const scanner = new SkillScannerImpl();
      const result = scanner.scanContent('const dir = __dirname;');
      expect(result.issues.some((i) => i.severity === 'low')).toBe(true);
    });

    it('detects Buffer.alloc as low severity', () => {
      const scanner = new SkillScannerImpl();
      const result = scanner.scanContent('const buf = Buffer.alloc(1024);');
      expect(result.issues.some((i) => i.severity === 'low')).toBe(true);
    });

    it('returns safe=true for clean content', () => {
      const scanner = new SkillScannerImpl();
      const result = scanner.scanContent('function add(a, b) { return a + b; }');
      expect(result.safe).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.riskScore).toBe(0);
    });

    it('computes correct risk score', () => {
      const scanner = new SkillScannerImpl();
      // Only process.env (weight 0.4) out of total ~4.4
      const result = scanner.scanContent('const x = process.env.KEY;');
      expect(result.riskScore).toBeGreaterThan(0);
      expect(result.riskScore).toBeLessThan(0.7);
      expect(result.safe).toBe(true);
    });

    it('marks unsafe when riskScore >= 0.7', () => {
      const scanner = new SkillScannerImpl();
      // Multiple high-weight categories
      const code = `
        import child_process from "child_process";
        eval("code");
        writeFileSync("f", "d");
        fetch("http://evil.com");
      `;
      const result = scanner.scanContent(code);
      expect(result.safe).toBe(false);
    });

    it('marks unsafe when any critical pattern found', () => {
      const scanner = new SkillScannerImpl();
      // Just eval is enough for safe=false
      const result = scanner.scanContent('eval("x")');
      expect(result.safe).toBe(false);
    });

    it('returns frozen result', () => {
      const scanner = new SkillScannerImpl();
      const result = scanner.scanContent('const x = 1;');
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.issues)).toBe(true);
    });

    it('caches results by SHA-256 hash', () => {
      const scanner = new SkillScannerImpl();
      const content = 'const safe = true;';
      const result1 = scanner.scanContent(content);
      const result2 = scanner.scanContent(content);
      expect(result1).toBe(result2); // Same object reference (cache hit)
    });

    it('does not return cached result for different content', () => {
      const scanner = new SkillScannerImpl();
      const result1 = scanner.scanContent('const a = 1;');
      const result2 = scanner.scanContent('eval("danger")');
      expect(result1).not.toBe(result2);
      expect(result1.safe).not.toBe(result2.safe);
    });

    it('records correct location offsets', () => {
      const scanner = new SkillScannerImpl();
      const result = scanner.scanContent('const x = eval("test");');
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].location).toMatch(/^offset:\d+$/);
    });
  });

  describe('scan() -- file-based', () => {
    let tmpDir: string;
    let tmpFile: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qos-scan-'));
    });

    afterEach(() => {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
      try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }
    });

    it('reads file and scans content', () => {
      tmpFile = path.join(tmpDir, 'safe-skill.js');
      fs.writeFileSync(tmpFile, 'function greet(name) { return `Hello ${name}`; }', 'utf-8');
      const scanner = new SkillScannerImpl();
      const result = scanner.scan(tmpFile);
      expect(result.safe).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('detects dangerous patterns in files', () => {
      tmpFile = path.join(tmpDir, 'dangerous-skill.js');
      fs.writeFileSync(tmpFile, 'const x = eval("rm -rf /");', 'utf-8');
      const scanner = new SkillScannerImpl();
      const result = scanner.scan(tmpFile);
      expect(result.safe).toBe(false);
    });

    it('throws on nonexistent file', () => {
      const scanner = new SkillScannerImpl();
      expect(() => scanner.scan('/nonexistent/file.js')).toThrow();
    });
  });
});
