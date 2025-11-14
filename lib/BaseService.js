const { getStateKey, setStateKey } = require('./state');

/**
 * Base class for all services with built-in caching, retry logic, and status tracking
 */
class BaseService {
  constructor(options = {}) {
    this.name = options.name || 'UnnamedService';
    this.cacheKey = options.cacheKey || this.name.toLowerCase();
    this.cacheTTL = options.cacheTTL || 15 * 60 * 1000; // Default 15 minutes
    this.retryAttempts = options.retryAttempts || 3;
    this.retryCooldown = options.retryCooldown || 1000; // Base cooldown in ms
    
    // Status tracking (minimal - most info comes from cache)
    this.status = {
      state: 'unknown', // unknown | healthy | degraded | unhealthy
      latency: null,
      error: null,
    };
  }

  /**
   * Check if service is enabled (has required credentials)
   * Override this in subclasses
   * @returns {boolean}
   */
  isEnabled() {
    return true;
  }

  /**
   * Get cache from state
   * @param {boolean} allowStale - If true, return expired cache
   * @returns {Object|null} Cached data or null if not available
   */
  getCache(allowStale = false, signature = null) {
    const allCaches = getStateKey('service_cache', {});
    const cache = allCaches[this.cacheKey];
    
    if (!cache || !cache.data) return null;
    
    if (signature && cache.signature !== signature) return null;

    if (allowStale) return cache.data;
    
    const isValid = (Date.now() - cache.fetchedAt) < this.cacheTTL;
    return isValid ? cache.data : null;
  }

  /**
   * Set cache in state
   * @param {Object} data - Data to cache
   */
  setCache(data, signature = null) {
    const allCaches = getStateKey('service_cache', {});
    allCaches[this.cacheKey] = {
      data,
      fetchedAt: Date.now(),
      signature,
    };
    setStateKey('service_cache', allCaches);
  }

  /**
   * Clear cache
   */
  clearCache() {
    const allCaches = getStateKey('service_cache', {});
    delete allCaches[this.cacheKey];
    setStateKey('service_cache', allCaches);
  }

  /**
   * Sleep helper for retry logic
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff delay
   * @param {number} attempt - Current attempt number (0-indexed)
   * @returns {number} Delay in milliseconds
   */
  getBackoffDelay(attempt) {
    const delay = this.retryCooldown * Math.pow(2, attempt);
    const jitter = Math.random() * 200; // Add jitter to prevent thundering herd
    return Math.min(delay + jitter, 10000); // Cap at 10 seconds
  }

  /**
   * Fetch data from API with retry logic
   * Override this in subclasses
   * @param {Object} config - Configuration object
   * @param {Object} logger - Logger instance
   * @returns {Promise<Object>} Raw API response
   */
  async fetchData(config, logger) {
    throw new Error('fetchData() must be implemented by subclass');
  }

  /**
   * Transform API data to dashboard format (also what gets cached)
   * Override this in subclasses
   * @param {Object} apiData - Raw API data
   * @param {Object} config - Configuration object
   * @returns {Object} Dashboard-formatted data (also cached)
   */
  mapToDashboard(apiData, config) {
    return apiData; // Default: return as-is
  }

  getCacheSignature(config) {
    return null;
  }

  /**
   * Save status to persistent state (only state, latency, error)
   */
  saveStatus() {
    const allStatuses = getStateKey('service_status', {});
    allStatuses[this.cacheKey] = {
      state: this.status.state,
      latency: this.status.latency,
      error: this.status.error,
    };
    setStateKey('service_status', allStatuses);
  }

  /**
   * Load status from persistent state
   */
  loadStatus() {
    const allStatuses = getStateKey('service_status', {});
    const saved = allStatuses[this.cacheKey];
    if (saved) {
      this.status.state = saved.state || this.status.state;
      this.status.latency = saved.latency || this.status.latency;
      this.status.error = saved.error || this.status.error;
    }
  }

  /**
   * Main method to get data (handles caching, retries, fallbacks)
   * @param {Object} config - Configuration object
   * @param {Object} logger - Logger instance
   * @returns {Promise<Object>} Dashboard-formatted data with metadata
   */
  async getData(config, logger = console) {
  const startTime = Date.now();
  const cacheSignature = this.getCacheSignature(config);
    
    // Load saved status so we preserve latency on cache hits
    this.loadStatus();

    // If not enabled, return null
    if (!this.isEnabled()) {
      this.status.state = 'disabled';
      this.saveStatus();
      return { data: null, source: 'disabled', status: this.getStatus() };
    }

    // Check cache first
    const cached = this.getCache(false, cacheSignature);
    if (cached) {
      logger.info?.(`[${this.name}] Using valid cache`);
      this.status.state = 'healthy';
      // Don't update latency - preserve the last API call latency
      this.saveStatus();
      return { 
        data: cached, 
        source: 'cache', 
        status: this.getStatus()
      };
    }

    // Attempt to fetch with retries
    let lastError;
    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.getBackoffDelay(attempt - 1);
          logger.warn?.(`[${this.name}] Retry attempt ${attempt + 1}/${this.retryAttempts} after ${delay}ms`);
          await this.sleep(delay);
        }

        const apiCallStart = Date.now();
        const apiData = await this.fetchData(config, logger);
        const apiLatency = Date.now() - apiCallStart;
        
  const dashboardData = this.mapToDashboard(apiData, config);
  this.setCache(dashboardData, cacheSignature);

        this.status.state = 'healthy';
        this.status.latency = apiLatency; // Only measure the actual API call time
        this.status.error = null;
        this.saveStatus();

        logger.info?.(`[${this.name}] Fetched successfully from API`);
        return { 
          data: dashboardData, 
          source: 'api', 
          status: this.getStatus() 
        };
      } catch (error) {
        lastError = error;
        logger.warn?.(`[${this.name}] Attempt ${attempt + 1} failed: ${error.message}`);
      }
    }

    // All retries failed, try stale cache
  const staleCache = this.getCache(true, cacheSignature);
    if (staleCache) {
      logger.warn?.(`[${this.name}] API failed, using stale cache. Error: ${lastError.message}`);
      this.status.state = 'degraded';
      // Don't update latency - preserve the last successful API call latency
      this.status.error = lastError.message;
      this.saveStatus();
      return { 
        data: staleCache, 
        source: 'stale_cache', 
        status: this.getStatus() 
      };
    }

    // No cache available, service is unhealthy
    logger.error?.(`[${this.name}] API failed with no cache fallback: ${lastError.message}`);
    this.status.state = 'unhealthy';
    // Latency is null since API call failed
    this.status.latency = null;
    this.status.error = lastError.message;
    this.saveStatus();
    
    throw lastError;
  }

  /**
   * Get current service status
   * @returns {Object} Status object
   */
  getStatus() {
    // Load saved status from state
    this.loadStatus();
    
    // Always check enabled dynamically (never cached)
    const isEnabled = this.isEnabled();
    
    // Get cache timestamp if available
    const allCaches = getStateKey('service_cache', {});
    const cache = allCaches[this.cacheKey];
    const fetchedAt = cache?.fetchedAt || null;
    
    // Determine state
    let state = this.status.state;
    if (!state || state === 'unknown') {
      if (!isEnabled) {
        state = 'disabled';
      } else if (!fetchedAt) {
        state = 'pending'; // Has credentials but hasn't run yet
      } else {
        state = 'unknown';
      }
    }
    
    return {
      name: this.name,
      isEnabled,
      state,
      cacheTTL: this.cacheTTL,
      fetchedAt,
      latency: this.status.latency,
      error: this.status.error,
    };
  }
}

module.exports = { BaseService };
