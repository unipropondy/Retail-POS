// ==============================================================================
// Author: JAVITH, BAVANI 30-10-2026
// Project: Supermarket Retail POS
// Module: Configuration Controller
// File: backend/controllers/configController.js
// Description: Express controller handling HTTP endpoints for centralized configuration
// ==============================================================================

const configService = require('../config/configService');

/**
 * GET /api/config
 * Retrieves all 89 active configuration settings with secrets masked
 */
function getConfig(req, res) {
  try {
    const rawConfig = configService.getAllConfig(true);
    const metadataList = configService.getConfigWithMetadata(true);

    return res.status(200).json({
      success: true,
      count: Object.keys(rawConfig).length,
      config: rawConfig,
      items: metadataList,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ [CONFIG CONTROLLER] Failed to get config:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve configuration: ' + error.message
    });
  }
}

/**
 * PUT /api/config
 * Updates specific configuration values and persists them to backend storage
 */
function updateConfig(req, res) {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body. Expected a JSON object of key-value pairs.'
      });
    }

    const result = configService.updateConfig(updates);

    if (!result.success && result.updatedCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed for all provided configuration keys.',
        errors: result.errors
      });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully updated ${result.updatedCount} setting(s).`,
      updatedKeys: result.updatedKeys,
      errors: result.errors,
      config: configService.getAllConfig(true)
    });
  } catch (error) {
    console.error('❌ [CONFIG CONTROLLER] Failed to update config:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update configuration: ' + error.message
    });
  }
}

/**
 * POST /api/config/reset
 * Resets configuration back to original VB.NET App.config defaults
 */
function resetConfig(req, res) {
  try {
    const result = configService.resetToDefaults();
    return res.status(200).json({
      success: true,
      message: result.message,
      config: configService.getAllConfig(true)
    });
  } catch (error) {
    console.error('❌ [CONFIG CONTROLLER] Failed to reset config:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset configuration: ' + error.message
    });
  }
}

module.exports = {
  getConfig,
  updateConfig,
  resetConfig
};
