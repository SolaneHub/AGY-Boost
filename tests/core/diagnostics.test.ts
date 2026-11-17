import { test as it, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DiagnosticRingBuffer, diagnostics } from "../../src/client/diagnostics/ring-buffer.js";

describe("Diagnostic Ring Buffer (DiagnosticRingBuffer)", () => {
  let ringBuffer: DiagnosticRingBuffer;

  beforeEach(() => {
    ringBuffer = new DiagnosticRingBuffer();
  });

  it("records events with timestamp, level, source, message and details", () => {
    const before = Date.now();
    const entry = ringBuffer.record("INFO", "test-source", "test message", {
      key: "value",
      num: 42,
    });
    const after = Date.now();

    assert.equal(entry.level, "INFO");
    assert.equal(entry.source, "test-source");
    assert.equal(entry.message, "test message");
    assert.deepEqual(entry.details, { key: "value", num: 42 });
    assert.ok(entry.timestamp >= before && entry.timestamp <= after);

    const entries = ringBuffer.getEntries();
    assert.equal(entries.length, 1);
    assert.ok(entries[0]);
    assert.deepEqual(entries[0], entry);
  });

  it("records events without details when optional parameter omitted", () => {
    const entry = ringBuffer.record("WARN", "system", "disk full");

    assert.equal(entry.level, "WARN");
    assert.equal(entry.source, "system");
    assert.equal(entry.message, "disk full");
    assert.equal(entry.details, undefined);
    assert.equal(ringBuffer.getEntries().length, 1);
  });

  it("enforces circular FIFO limit of 100 entries", () => {
    // Insert 150 items
    for (let i = 1; i <= 150; i++) {
      ringBuffer.record("METRIC", "counter", `event-${i}`, { idx: i });
    }

    const entries = ringBuffer.getEntries();
    assert.equal(entries.length, 100);

    const first = entries[0];
    const last = entries[99];
    assert.ok(first);
    assert.ok(last);

    // Oldest 50 items (1..50) must have been evicted, retaining 51..150
    assert.equal(first.message, "event-51");
    assert.equal(first.details?.["idx"], 51);

    assert.equal(last.message, "event-150");
    assert.equal(last.details?.["idx"], 150);

    // Check chronological order across the retained items
    for (let i = 0; i < entries.length; i++) {
      const item = entries[i];
      assert.ok(item);
      assert.equal(item.message, `event-${i + 51}`);
    }
  });

  it("returns an immutable/isolated copy from getEntries()", () => {
    ringBuffer.record("INFO", "core", "msg 1");
    const entries = ringBuffer.getEntries();
    assert.equal(entries.length, 1);

    // Modifying the returned array copy should not mutate the internal buffer
    (entries as unknown as unknown[]).push({
      timestamp: 0,
      level: "ERROR",
      source: "fake",
      message: "fake",
    });
    assert.equal(ringBuffer.getEntries().length, 1);
  });

  it("clears all recorded entries on clear()", () => {
    ringBuffer.record("INFO", "core", "event 1");
    ringBuffer.record("ERROR", "core", "event 2");
    assert.equal(ringBuffer.getEntries().length, 2);

    ringBuffer.clear();
    assert.equal(ringBuffer.getEntries().length, 0);

    // Can record new entries after clearing
    ringBuffer.record("WARN", "core", "event 3");
    const current = ringBuffer.getEntries();
    assert.equal(current.length, 1);
    const item = current[0];
    assert.ok(item);
    assert.equal(item.message, "event 3");
  });

  it("exports a functional default singleton instance", () => {
    diagnostics.clear();
    assert.equal(diagnostics.getEntries().length, 0);

    diagnostics.record("INFO", "singleton-test", "singleton message");
    const entries = diagnostics.getEntries();
    assert.equal(entries.length, 1);
    const item = entries[0];
    assert.ok(item);
    assert.equal(item.source, "singleton-test");

    diagnostics.clear();
    assert.equal(diagnostics.getEntries().length, 0);
  });
});
