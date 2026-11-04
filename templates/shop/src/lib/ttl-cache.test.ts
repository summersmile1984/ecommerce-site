import { describe, it, expect } from "vitest";
import { createTtlCache } from "./ttl-cache";

describe("ttlCache", () => {
  it("serves within ttl, expires after, clears on demand", () => {
    const cache = createTtlCache(60_000);
    cache.set("k", "v", 1000); // storedAt=1000
    expect(cache.get("k", 1000)).toBe("v");
    expect(cache.get("k", 61_001)).toBeNull(); // expired
    cache.set("k2", "v2", 1000);
    expect(cache.size()).toBe(1);
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});
