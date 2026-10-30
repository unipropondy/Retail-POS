// ==============================================================================
// Author: JAVITH, BAVANI 30-10-2026
// Project: Supermarket Retail POS
// Module: Configuration Management Service
// File: backend/config/configService.js
// Description: Manages loading, caching, masking, updating, and persisting
//              all 89 active settings from App.config. Zero database modifications.
// ==============================================================================

const fs = require('fs');
const { DEFAULT_CONFIG, CONFIG_FILE_PATH, SETTING_METADATA } = require('./appConfig');

class ConfigService {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.loadPersistedConfig();
  }

  /**
   * Load overrides from persistent runtime file on disk if available
   */
  loadPersistedConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE_PATH)) {
        const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
        const overrides = JSON.parse(raw);
        this.config = { ...DEFAULT_CONFIG, ...overrides };
        console.log('✅ [CONFIG] Successfully loaded persisted configuration overrides.');
      } else {
        // Save initial defaults to disk
        this.savePersistedConfig();
        console.log('ℹ️ [CONFIG] Initialized default configuration file.');
      }
    } catch (err) {
      console.warn('⚠️ [CONFIG] Failed to load persisted configuration, falling back to defaults:', err.message);
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Save configuration to persistent file on disk
   */
  savePersistedConfig() {
    try {
      fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(this.config, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('❌ [CONFIG] Failed to save configuration to disk:', err.message);
      return false;
    }
  }

  /**
   * Get all active configuration entries
   * @param {boolean} maskSecrets - If true, masks sensitive passwords and private keys
   */
  getAllConfig(maskSecrets = true) {
    const result = {};
    for (const [key, value] of Object.entries(this.config)) {
      const meta = SETTING_METADATA[key] || {};
      if (maskSecrets && meta.isSecret) {
        result[key] = value ? '********' : '';
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Get configuration enriched with category, type, and labels for UI management
   */
  getConfigWithMetadata(maskSecrets = true) {
    const list = [];
    for (const [key, meta] of Object.entries(SETTING_METADATA)) {
      let val = this.config[key];
      const isSecret = Boolean(meta.isSecret);
      if (maskSecrets && isSecret) {
        val = val ? '********' : '';
      }

      list.push({
        key,
        value: val,
        category: meta.category,
        type: meta.type,
        label: meta.label,
        desc: meta.desc,
        isSecret: isSecret
      });
    }
    return list;
  }

  /**
   * Get single setting value by key (raw, for backend internal usage)
   */
  get(key) {
    return this.config[key];
  }

  /**
   * Get boolean evaluation for a key (supports '1'/'0', 1/0, 'Y'/'N', true/false)
   */
  getBoolean(key) {
    const val = this.config[key];
    if (typeof val === 'boolean') return val;
    if (val === 1 || val === '1' || val === 'Y' || val === 'y' || val === 'true') return true;
    return false;
  }

  /**
   * Get numeric evaluation for a key
   */
  getNumber(key, defaultVal = 0) {
    const val = Number(this.config[key]);
    return isNaN(val) ? defaultVal : val;
  }

  /**
   * Update configuration values with validation
   * @param {Object} newValues - Object containing key-value pairs to update
   */
  updateConfig(newValues) {
    const updatedKeys = [];
    const errors = [];

    for (const [key, value] of Object.entries(newValues)) {
      if (!(key in DEFAULT_CONFIG)) {
        errors.push(`Unknown configuration key: ${key}`);
        continue;
      }

      const meta = SETTING_METADATA[key] || {};

      // If user passed masked placeholder, do not overwrite existing real secret
      if (meta.isSecret && (value === '********' || value === '')) {
        continue;
      }

      // Type validation and normalization
      let normalizedValue = value;
      if (meta.type === 'number') {
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(`Value for ${key} must be a valid number`);
          continue;
        }
        normalizedValue = num;
      } else if (meta.type === 'boolean') {
        normalizedValue = (value === 1 || value === '1' || value === true || value === 'true') ? 1 : 0;
      } else if (meta.type === 'boolean_yn') {
        normalizedValue = (value === 'Y' || value === 'y' || value === true || value === 1 || value === '1') ? 'Y' : 'N';
      }

      this.config[key] = normalizedValue;
      updatedKeys.push(key);
    }

    if (updatedKeys.length > 0) {
      this.savePersistedConfig();
    }

    return {
      success: errors.length === 0,
      updatedCount: updatedKeys.length,
      updatedKeys,
      errors
    };
  }

  /**
   * Reset all configurations back to original VB.NET App.config defaults
   */
  resetToDefaults() {
    this.config = { ...DEFAULT_CONFIG };
    this.savePersistedConfig();
    return {
      success: true,
      message: 'Configuration successfully reset to original VB.NET App.config defaults.'
    };
  }
}

// Singleton instance
const configService = new ConfigService();

module.exports = configService;
