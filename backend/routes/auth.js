// ==============================================================================
// Author: JAVITH 28-10-2026
// Project: Supermarket Retail POS
// File: routes/auth.js
// Description: Cashier and Admin authentication with tblmaTerminal validation.
//              Verifies that the PC hostname is registered in tblmaTerminal before
//              allowing login to protect unauthorized terminal access.
// ==============================================================================

// Express router module to define API endpoints
const express = require('express');
const router = express.Router();

// Node.js OS module to get the local PC's Windows ComputerName / Hostname
const os = require('os');

// JSON Web Token module for creating secure session tokens
const jwt = require('jsonwebtoken');

// Database pool and connection helper functions
const { sql, getPool } = require('../config/db');

module.exports = function (jwtSecret) {

  // ----------------------------------------------------------------------------
  // Helper Function: Find and validate terminal in tblmaTerminal
  // ----------------------------------------------------------------------------
  async function getTerminalConfig(pool, overrideComputerName) {
    // Get the current PC's Windows ComputerName (e.g. "DESKTOP-20UPC86")
    const computerName = (overrideComputerName || os.hostname()).trim().toUpperCase();

    // Query tblmaTerminal for this specific ComputerName
    const result = await pool
      .request()
      .input('computerName', sql.VarChar, computerName)
      .query(`
        SELECT TOP 1
          RTRIM(LTRIM(TerminalCode)) AS TerminalCode,
          RTRIM(LTRIM(TerminalName)) AS TerminalName,
          RTRIM(LTRIM(LocationCode)) AS LocationCode,
          RTRIM(LTRIM(ComputerName)) AS ComputerName,
          TillAmount,
          CustDisplayRequired,
          BarCodeRequired,
          PrinterRequired,
          RTRIM(LTRIM(PrinterType)) AS PrinterType,
          RTRIM(LTRIM(PrinterName)) AS PrinterName,
          CashDrawerInterface,
          unid
        FROM tblmaTerminal
        WHERE UPPER(RTRIM(LTRIM(ComputerName))) = @computerName
      `);

    if (result.recordset && result.recordset.length > 0) {
      return { found: true, computerName, terminal: result.recordset[0] };
    }

    return { found: false, computerName, terminal: null };
  }


  // ----------------------------------------------------------------------------
  // GET /api/auth/terminal-info
  // Checks if the current machine is registered in tblmaTerminal
  // ----------------------------------------------------------------------------
  router.get('/terminal-info', async (req, res) => {
    try {
      const pool = await getPool();

      if (!pool) {
        return res.status(503).json({
          success: false,
          configured: false,
          message: 'Database is currently unreachable. Please verify network/VPN.',
        });
      }

      // Allow optional override query parameter for testing other computer names
      const queryName = req.query.computerName || null;
      const { found, computerName, terminal } = await getTerminalConfig(pool, queryName);

      if (!found) {
        return res.status(403).json({
          success: false,
          configured: false,
          computerName,
          message: 'Terminal not configured. Please contact system administartor.',
        });
      }

      return res.status(200).json({
        success: true,
        configured: true,
        computerName,
        terminal: {
          terminalCode: terminal.TerminalCode,
          terminalName: terminal.TerminalName,
          locationCode: terminal.LocationCode,
          computerName: terminal.ComputerName,
          printerName: terminal.PrinterName,
          printerType: terminal.PrinterType,
          tillAmount: terminal.TillAmount,
        },
      });
    } catch (error) {
      console.error('❌ [TERMINAL CHECK ERROR]:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error verifying terminal: ' + error.message,
      });
    }
  });


  // ----------------------------------------------------------------------------
  // POST /api/auth/login
  // 1. Verifies that the PC ComputerName is registered in tblmaTerminal
  // 2. Authenticates Cashier or Admin against live tblMausermaster
  // ----------------------------------------------------------------------------
  router.post('/login', async (req, res) => {
    try {
      const { username, password, computerName: clientComputerName } = req.body;

      // 1. Validate that username and password were provided
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Please provide both username and password.',
        });
      }

      const inputUsername = String(username).trim().toUpperCase();
      const inputPassword = String(password).trim();

      // 2. Obtain connection pool to live MS SQL Server
      const pool = await getPool();

      if (!pool) {
        return res.status(503).json({
          success: false,
          message: 'Database is currently unreachable. Please verify MS SQL Server and network/VPN connection.',
        });
      }

      // 3. TERMINAL CHECK: Query tblmaTerminal for this PC's ComputerName
      const { found, computerName, terminal } = await getTerminalConfig(pool, clientComputerName);

      if (!found) {
        console.warn(`⛔ [BLOCKED] PC "${computerName}" is NOT registered in tblmaTerminal.`);
        return res.status(403).json({
          success: false,
          terminalConfigured: false,
          computerName,
          message: 'Terminal not configured. Please contact system administartor.',
        });
      }

      console.log(`💻 [TERMINAL VALIDATED] Code: ${terminal.TerminalCode} | Host: ${computerName}`);

      // 4. CASHIER AUTHENTICATION: Query tblMausermaster safely using parameterized input
      console.log(`🔍 [AUTH] Querying tblMausermaster for user: ${inputUsername}`);

      const userResult = await pool
        .request()
        .input('username', sql.VarChar, inputUsername)
        .query(`
          SELECT TOP 1
            unid,
            RTRIM(LTRIM(UserCode)) AS UserCode,
            RTRIM(LTRIM(UserName)) AS UserName,
            RTRIM(LTRIM(Password)) AS Password,
            RTRIM(LTRIM(UserGroupCode)) AS UserGroupCode,
            IsAdmin,
            IsCashier,
            ExpiryDate
          FROM tblMausermaster
          WHERE UPPER(RTRIM(LTRIM(UserCode))) = @username 
             OR UPPER(RTRIM(LTRIM(UserName))) = @username
        `);

      // 5. Check if user exists in tblMausermaster
      if (!userResult.recordset || userResult.recordset.length === 0) {
        return res.status(401).json({
          success: false,
          message: `User '${username}' not found in tblMausermaster.`,
        });
      }

      const user = userResult.recordset[0];

      // 6. Verify password against stored value in tblMausermaster
      const storedPassword = String(user.Password).trim();
      if (inputPassword !== storedPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid security PIN / password. Please try again.',
        });
      }

      // 7. Generate signed JWT session token with both Cashier and Terminal context
      const token = jwt.sign(
        {
          unid: user.unid,
          userCode: user.UserCode,
          userName: user.UserName,
          userGroup: user.UserGroupCode,
          isAdmin: user.IsAdmin === 1 || user.IsAdmin === true,
          isCashier: user.IsCashier === 1 || user.IsCashier === true,
          terminalCode: terminal.TerminalCode,
          locationCode: terminal.LocationCode,
          computerName: terminal.ComputerName,
        },
        jwtSecret,
        { expiresIn: '12h' } // 12-hour session duration for cashier shift
      );

      // 8. Log success
      console.log(`✅ [LOGIN SUCCESS] User: ${user.UserName} (${user.UserGroupCode}) on Terminal: ${terminal.TerminalCode}`);

      // Return user profile, terminal configuration, and session token
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        terminal: {
          terminalCode: terminal.TerminalCode,
          terminalName: terminal.TerminalName,
          locationCode: terminal.LocationCode,
          computerName: terminal.ComputerName,
          printerName: terminal.PrinterName,
          printerType: terminal.PrinterType,
        },
        user: {
          unid: user.unid,
          userCode: user.UserCode,
          userName: user.UserName,
          userGroup: user.UserGroupCode,
          isAdmin: user.IsAdmin === 1 || user.IsAdmin === true,
          isCashier: user.IsCashier === 1 || user.IsCashier === true,
        },
      });
    } catch (error) {
      console.error('❌ [AUTH ERROR] Database query exception:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Database query error: ' + error.message,
      });
    }
  });

  return router;
};
