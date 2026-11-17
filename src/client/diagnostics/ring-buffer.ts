// Diagnostic Ring Buffer for AGY Boost Runtime
// Strictly adheres to AGENTS.md (zero external dependencies, no console.* calls).

export interface DiagnosticEntry {
  timestamp: number;
  level: "INFO" | "WARN" | "ERROR" | "METRIC";
  source: string;
  message: string;
  details?: Record<string, unknown>;
}

export class DiagnosticRingBuffer {
  private readonly capacity: number = 100;
  private buffer: DiagnosticEntry[] = [];

  constructor(capacity = 100) {
    this.capacity = capacity;
  }

  record(
    level: DiagnosticEntry["level"],
    source: string,
    message: string,
    details?: Record<string, unknown>,
  ): DiagnosticEntry {
    const entry: DiagnosticEntry = {
      timestamp: Date.now(),
      level,
      source,
      message,
      ...(details === undefined ? {} : { details }),
    };

    if (this.buffer.length >= this.capacity) {
      this.buffer.shift();
    }
    this.buffer.push(entry);

    return entry;
  }

  getEntries(): readonly DiagnosticEntry[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }
}

export const diagnostics = new DiagnosticRingBuffer();
