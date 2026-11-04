import { describe, it, expect } from "vitest";
import { parseDotEnv, loadDotEnv } from "./dotenv";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("parseDotEnv", () => {
  it("parses KEY=VALUE lines, skips comments/blank", () => {
    const out = parseDotEnv("# comment\nEMDASH_URL=http://x\n\nPAT=abc\n");
    expect(out).toEqual({ EMDASH_URL: "http://x", PAT: "abc" });
  });
  it("keeps existing process values (never overrides)", () => {
    const dir = mkdtempSync(join(tmpdir(), "dotenv-"));
    try {
      writeFileSync(join(dir, ".env"), "FOO=fromfile\n");
      const prev = process.env.FOO;
      process.env.FOO = "fromshell";
      const applied = loadDotEnv(dir);
      expect(applied).toEqual({}); // file value NOT applied — shell wins
      expect(process.env.FOO).toBe("fromshell");
      delete process.env.FOO;
      if (prev !== undefined) process.env.FOO = prev;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("fills missing keys from file", () => {
    const dir = mkdtempSync(join(tmpdir(), "dotenv-"));
    try {
      writeFileSync(join(dir, ".env"), "BAR=fromfile\n");
      delete process.env.BAR;
      const applied = loadDotEnv(dir);
      expect(applied).toEqual({ BAR: "fromfile" });
      expect(process.env.BAR).toBe("fromfile");
      delete process.env.BAR;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
