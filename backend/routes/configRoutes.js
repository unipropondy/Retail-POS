// ==============================================================================
// Author: JAVITH, BAVANI 30-10-2026
// Project: Supermarket Retail POS
// Module: Configuration API Routes
// File: backend/routes/configRoutes.js
// Description: Express routes for retrieving, updating, and resetting App.config settings
// ==============================================================================

const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');

// GET /api/config - Returns all settings with metadata
router.get('/', configController.getConfig);

// PUT /api/config - Updates settings with validation and file persistence
router.put('/', configController.updateConfig);

// POST /api/config/reset - Resets to original App.config defaults
router.post('/reset', configController.resetConfig);

module.exports = router;
