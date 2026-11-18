// ==============================================================================
// Author: JAVITH, BAVANI 28-10-2026
// Project: Supermarket Retail POS
// Module: Payment Modes & Tender Configuration (tblInvPaymode)
// File: routes/paymode.js
//
// Change History:
//   - 28-10-2026 | JAVITH | Dedicated payment mode module separating financial/tender
//                          configuration from inventory management.
// ==============================================================================

const express = require("express");
const router = express.Router();
const { sql, getPool } = require("../config/db");
const configService = require("../config/configService");

// ------------------------------------------------------------------------------
// GET /api/paymode
// [JAVITH - 28-10-2026]: Fetches payment modes configured in [dbo].[tblInvPaymode]
// [AUDIT 2026-11-18]: Includes dynamic paymode3 and paymode4 positions and labels
// matching legacy frmPos1.vb AddButtonsToPanel9()
// Query Parameters:
//   - activeOnly (optional, default: true): Filter only active payment methods
// ------------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(503).json({
        success: false,
        message: "Database is currently unreachable. Please check network/VPN.",
      });
    }

    const activeOnly = req.query.activeOnly !== "false";

    let query = `
      SELECT 
        CAST(Position AS INT) AS Position,
        RTRIM(LTRIM(PayMode)) AS PayMode,
        RTRIM(LTRIM(Description)) AS Description,
        Active,
        ISNULL(Commission, 0) AS Commission,
        ISNULL(isVoucher, 0) AS isVoucher,
        ISNULL(isMember, 0) AS isMember
      FROM [dbo].[tblInvPaymode]
    `;

    if (activeOnly) {
      query += ` WHERE Active = 1`;
    }

    query += ` ORDER BY Position ASC, PayMode ASC`;

    const result = await pool.request().query(query);
    const paymodes = result.recordset || [];

    // Resolve dynamic paymode3 & paymode4 from configService (defaults: 14 and 15)
    const paymode3Pos = Number(configService.get("paymode3")) || 14;
    const paymode4Pos = Number(configService.get("paymode4")) || 15;

    const pm3 = paymodes.find((p) => Number(p.Position) === paymode3Pos);
    const pm4 = paymodes.find((p) => Number(p.Position) === paymode4Pos);

    const paymode3Name = pm3 ? pm3.PayMode : "CREDIT";
    const paymode4Name = pm4 ? pm4.PayMode : "PAYWAY";

    return res.status(200).json({
      success: true,
      count: paymodes.length,
      paymodes,
      paymode3: {
        position: paymode3Pos,
        payMode: paymode3Name,
      },
      paymode4: {
        position: paymode4Pos,
        payMode: paymode4Name,
      },
    });
  } catch (error) {
    console.error(
      "❌ [PAYMODE ERROR] Failed to fetch paymodes:",
      error.message,
    );
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment modes: " + error.message,
    });
  }
});

module.exports = router;
