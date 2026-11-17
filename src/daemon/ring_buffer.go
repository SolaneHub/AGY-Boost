package daemon

import (
	"strings"
	"sync"
	"time"
)

// LogBufferCapacity is the bounded maximum number of entries in the ring buffer.
const LogBufferCapacity = 50

// LogEntry represents a single timestamped log event stored strictly in memory.
type LogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"`
	Message   string    `json:"message"`
}

// LogRingBuffer is a thread-safe, strictly in-memory circular ring buffer of LogEntry records.
// It maintains at most capacity entries with FIFO eviction and 0 disk writes.
type LogRingBuffer struct {
	mu       sync.RWMutex
	capacity int
	entries  []LogEntry
	start    int
	count    int
}

// NewLogRingBuffer creates an in-memory ring buffer bounded to the specified capacity.
func NewLogRingBuffer(capacity int) *LogRingBuffer {
	if capacity <= 0 {
		capacity = LogBufferCapacity
	}
	return &LogRingBuffer{
		capacity: capacity,
		entries:  make([]LogEntry, capacity),
	}
}

// Add appends a new LogEntry into the ring buffer.
// If the buffer is full, the oldest entry is overwritten (FIFO).
func (rb *LogRingBuffer) Add(entry LogEntry) {
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now().UTC()
	}
	rb.mu.Lock()
	defer rb.mu.Unlock()

	if rb.count < rb.capacity {
		idx := (rb.start + rb.count) % rb.capacity
		rb.entries[idx] = entry
		rb.count++
	} else {
		// Overwrite the oldest element at rb.start and advance start
		rb.entries[rb.start] = entry
		rb.start = (rb.start + 1) % rb.capacity
	}
}

// Entries returns an immutable snapshot of all logged entries in chronological order.
// Returns an empty slice (never nil) if no entries are present.
func (rb *LogRingBuffer) Entries() []LogEntry {
	rb.mu.RLock()
	defer rb.mu.RUnlock()

	if rb.count == 0 {
		return []LogEntry{}
	}

	result := make([]LogEntry, rb.count)
	for i := 0; i < rb.count; i++ {
		result[i] = rb.entries[(rb.start+i)%rb.capacity]
	}
	return result
}

// Count returns the current number of stored entries.
func (rb *LogRingBuffer) Count() int {
	rb.mu.RLock()
	defer rb.mu.RUnlock()
	return rb.count
}

// Capacity returns the maximum capacity of the ring buffer.
func (rb *LogRingBuffer) Capacity() int {
	return rb.capacity
}

// Clear removes all entries from the ring buffer.
func (rb *LogRingBuffer) Clear() {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	rb.entries = make([]LogEntry, rb.capacity)
	rb.start = 0
	rb.count = 0
}

// Write implements io.Writer to allow redirecting logs directly into the ring buffer.
func (rb *LogRingBuffer) Write(p []byte) (n int, err error) {
	msg := strings.TrimRight(string(p), "\r\n")
	if len(msg) > 0 {
		rb.Add(LogEntry{
			Timestamp: time.Now().UTC(),
			Level:     "INFO",
			Message:   msg,
		})
	}
	return len(p), nil
}
