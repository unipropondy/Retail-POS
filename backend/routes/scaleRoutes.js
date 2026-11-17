// ==============================================================================
// Project: Supermarket Retail POS
// Module: Scale Routes (Live Counter Scale API)
// File: backend/routes/scaleRoutes.js
// Description: Provides live counter scale endpoints for fractional produce items
// ==============================================================================

const express = require('express');
const router = express.Router();
const scaleService = require('../services/scaleService');
const configService = require('../config/configService');

// GET /api/scale/ports
// Lists all available hardware COM ports on this machine
router.get('/ports', async (req, res) => {
  try {
    const ports = await scaleService.listPorts();
    return res.json({ success: true, ports });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/scale/read?port=COM1&baud=9600
// Reads live weight from the physical scale connected to the counter
router.get('/read', async (req, res) => {
  try {
    const comPort = (req.query.port || configService.get('COMPort') || 'COM1').trim();
    const baudRate = parseInt(req.query.baud || configService.get('ScaleBaudRate') || '9600', 10);

    const result = await scaleService.readLiveWeight(comPort, baudRate);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, weight: 0.0, message: err.message, connected: false });
  }
});

module.exports = router;
