/**
 * Simple in-memory cache manager for API routes
 * Provides TTL-based caching with pattern-based invalidation
 *
 * Usage:
 * const cache = new CacheManager(5 * 60 * 1000) // 5 minute TTL
 * const data = cache.get(key) ?? await fetchFromDB()
 * cache.set(key, data)
 * cache.invalidate('prefix:') // Clear matching keys
 */

export class CacheManager {
  private cache = new Map<string, { data: any; timestamp: number }>()

  constructor(private ttlMs: number) {}

  /**
   * Get a value from cache if it exists and hasn't expired
   * @param key Cache key
   * @returns Cached data or null if not found or expired
   */
  get(key: string): any | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    // Check if entry has expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  /**
   * Set a value in cache with current timestamp
   * @param key Cache key
   * @param data Data to cache
   */
  set(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() })
  }

  /**
   * Invalidate cache entries matching a pattern
   * Example: invalidate('clientes:') will clear 'clientes:search', 'clientes:all', etc.
   * @param pattern Pattern to match (without wildcards, e.g., "clientes:" not "clientes:*")
   */
  invalidate(pattern: string): void {
    const prefix = pattern.replace('*', '')
    const keysToDelete = Array.from(this.cache.keys()).filter((key) => key.startsWith(prefix))
    keysToDelete.forEach((key) => {
      this.cache.delete(key)
    })
  }

  /**
   * Clear all cached entries
   */
  invalidateAll(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics (useful for debugging/monitoring)
   */
  getStats() {
    return {
      size: this.cache.size,
      ttlMs: this.ttlMs,
    }
  }
}
