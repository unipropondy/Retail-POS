// ==============================================================================
// Author: JAVITH 28-10-2026
// Project: Supermarket Retail POS
// File: server.js
// Description: Main HTTP server entry point with non-blocking DB pool connection,
//              CORS support, dynamic cryptographic JWT secret, and auth routes.
// ==============================================================================

// Load secret variables from .env into process.env
require('dotenv').config();

// Express: Fast, unopinionated, minimalist web framework for Node.js
const express = require('express');

// CORS: Enables your React Native / Expo app (on port 8081) to communicate with this server (port 5000)
const cors = require('cors');

// Crypto: Built-in Node tool to generate unpredictable secure keys
const crypto = require('crypto');

// Database pool instance
const { getPool, isDbConnected } = require('./config/db');


// ==============================================================================
// 1. DYNAMIC JWT SECRET GENERATION
// ==============================================================================

// Generates a 64-byte random hex string every time the server boots up.
// This guarantees that security keys are freshly created on every deployment or server restart.
const JWT_SECRET = crypto.randomBytes(64).toString('hex');


// ==============================================================================
// 2. EXPRESS APPLICATION CONFIGURATION
// ==============================================================================

const app = express();
const PORT = process.env.PORT || 5000;

// Enable Cross-Origin requests from Expo web / mobile app
app.use(cors());

// Automatically parse incoming JSON request bodies
app.use(express.json());


// ==============================================================================
// 3. API ROUTES SETUP
// ==============================================================================

// Root health check endpoint to check server & database status
// Developer: JAVITH 28-10-2026
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    system: 'Supermarket Retail POS Backend',
    database: process.env.DB_NAME,
    sqlServerReachable: isDbConnected(),
    timestamp: new Date().toISOString(),
  });
});

// Mount authentication routes (handles login against tblMausermaster)
const authRoutes = require('./routes/auth')(JWT_SECRET);
app.use('/api/auth', authRoutes);


// ==============================================================================
// 4. SERVER STARTUP (NON-BLOCKING)
// ==============================================================================

// Start listening for HTTP connections immediately
app.listen(PORT, async () => {
  console.log('====================================================');
  console.log(`🚀 Retail POS Server is live on port: ${PORT}`);
  console.log(`🌐 Base URL: http://localhost:${PORT}`);
  console.log('🔒 JWT Session Security: Initialized');
  console.log('====================================================');

  // Attempt to connect to MS SQL in the background without blocking the HTTP server
  console.log('🔄 Checking MS SQL Server connection...');
  await getPool();
});
