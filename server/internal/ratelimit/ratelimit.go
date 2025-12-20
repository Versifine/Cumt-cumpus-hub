package ratelimit

import (
	"sync"
	"time"
)

type entry struct {
	count     int
	resetTime time.Time
}

// FixedWindow is a tiny fixed-window rate limiter for demo usage.
type FixedWindow struct {
	mu     sync.Mutex
	window time.Duration
	limit  int
	items  map[string]entry
}

func NewFixedWindow(window time.Duration, limit int) *FixedWindow {
	return &FixedWindow{
		window: window,
		limit:  limit,
		items:  map[string]entry{},
	}
}

func (l *FixedWindow) Allow(key string) bool {
	now := time.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	item := l.items[key]
	if item.resetTime.IsZero() || now.After(item.resetTime) {
		item = entry{count: 0, resetTime: now.Add(l.window)}
	}
	if item.count >= l.limit {
		l.items[key] = item
		return false
	}
	item.count++
	l.items[key] = item
	return true
}
