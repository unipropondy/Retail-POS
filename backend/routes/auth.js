// ==============================================================================
// Author: JAVITH 28-10-2026
// Project: Supermarket Retail POS
// File: routes/auth.js
// Description: Cashier and Admin authentication querying live tblMausermaster.
// ==============================================================================

// Express router module to define API endpoints
const express = require('express');
const router = express.Router();

// JSON Web Token module for creating secure session tokens
const jwt = require('jsonwebtoken');

// Database pool and connection helper functions
const { sql, getPool } = require('../config/db');

module.exports = function (jwtSecret) {

  // ----------------------------------------------------------------------------
  // POST /api/auth/login
  // Authenticates Cashier or Admin against live tblMausermaster in MS SQL Server
  // ----------------------------------------------------------------------------
  router.post('/login', async (req, res) => {
    try {
      // Extract username and password from request body
      const { username, password } = req.body;

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

      // If database is not reachable, return connection failure error
      if (!pool) {
        return res.status(503).json({
          success: false,
          message: 'Database is currently unreachable. Please verify your MS SQL Server and network/VPN connection.',
        });
      }

      // 3. Query tblMausermaster safely using parameterized input (@username)
      console.log(`🔍 [AUTH] Querying tblMausermaster for user: ${inputUsername}`);

      const result = await pool
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

      // 4. Check if a user with that code or name exists in the table
      if (!result.recordset || result.recordset.length === 0) {
        return res.status(401).json({
          success: false,
          message: `User '${username}' not found in tblMausermaster.`,
        });
      }

      const user = result.recordset[0];

      // 5. Verify the password against stored value in tblMausermaster
      const storedPassword = String(user.Password).trim();
      if (inputPassword !== storedPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid security PIN / password. Please try again.',
        });
      }

      // 6. Generate signed JWT session token
      const token = jwt.sign(
        {
          unid: user.unid,
          userCode: user.UserCode,
          userName: user.UserName,
          userGroup: user.UserGroupCode,
          isAdmin: user.IsAdmin === 1 || user.IsAdmin === true,
          isCashier: user.IsCashier === 1 || user.IsCashier === true,
        },
        jwtSecret,
        { expiresIn: '12h' } // 12-hour session duration for cashier shift
      );

      // 7. Log success (without printing developer name in logs)
      console.log(`✅ [LOGIN SUCCESS] User: ${user.UserName} (${user.UserGroupCode})`);

      // Return user profile and session token
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
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
