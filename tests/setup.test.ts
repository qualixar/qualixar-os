import { describe, it, expect } from 'vitest';

describe('Project setup', () => {
  it('vitest works', () => {
    expect(1 + 1).toBe(2);
  });

  it('node version is 22+', () => {
    const major = parseInt(process.version.slice(1).split('.')[0], 10);
    expect(major).toBeGreaterThanOrEqual(22);
  });
});
