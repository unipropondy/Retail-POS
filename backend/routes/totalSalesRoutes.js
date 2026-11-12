// ==============================================================================
// Project: Supermarket Retail POS
// Module: Total Sales Route (frmTotalSales.vb & clsPaymode.vb)
// File: backend/routes/totalSalesRoutes.js
// Description: Replicates exact VB.NET frmTotalSales.vb logic:
//              - Queries current shift / day sales by payment mode from
//                [tblPOSPayModeDetailCur] joined with [tblPOSSalesHeaderCur].
//              - Groups by TerminalCode and Paymode.
//              - Calculates Computer Total as the sum of all Amount values.
//              - Supports optional terminalCode and date filters.
//              - Returns data ready for DataGridView / React table rendering:
//                [{ TerminalCode, Paymode, Amount }] and computerTotal.
// ==============================================================================

const express = require("express");
const router = express.Router();
const { sql, getPool } = require("../config/db");

// ------------------------------------------------------------------------------
// GET /api/total-sales
// Equivalent to VB.NET: objPaymode.GetTotalSales(gsConn, "Pay")
// ------------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(503).json({
        success: false,
        message: "Database is currently unreachable. Please check network/VPN connection.",
      });
    }

    const { terminalCode, date } = req.query;

    let query = `
      SELECT 
        RTRIM(LTRIM(ISNULL(h.TerminalCode, '1'))) AS TerminalCode,
        RTRIM(LTRIM(ISNULL(p.PayMode, 'CASH'))) AS Paymode,
        CAST(ROUND(SUM(ISNULL(p.Amount, 0)), 2) AS DECIMAL(18, 2)) AS Amount
      FROM [dbo].[tblPOSPayModeDetailCur] p WITH (NOLOCK)
      INNER JOIN [dbo].[tblPOSSalesHeaderCur] h WITH (NOLOCK) 
        ON RTRIM(LTRIM(p.InvoiceNo)) = RTRIM(LTRIM(h.InvoiceNo))
      WHERE 1 = 1
    `;

    const request = pool.request();

    // Optional TerminalCode filter
    if (terminalCode && terminalCode.trim().length > 0 && terminalCode.trim().toUpperCase() !== "ALL") {
      query += ` AND RTRIM(LTRIM(h.TerminalCode)) = @terminalCode`;
      request.input("terminalCode", sql.VarChar(20), terminalCode.trim());
    }

    // Optional Date filter
    if (date && date.trim().length > 0) {
      query += ` AND CONVERT(VARCHAR(10), h.InvoiceDate, 120) = @date`;
      request.input("date", sql.VarChar(10), date.trim());
    }

    query += `
      GROUP BY 
        RTRIM(LTRIM(ISNULL(h.TerminalCode, '1'))),
        RTRIM(LTRIM(ISNULL(p.PayMode, 'CASH')))
      ORDER BY 
        TerminalCode ASC,
        Paymode ASC
    `;

    const result = await request.query(query);
    const records = result.recordset || [];

    // VB.NET Calculation:
    // For iRow = 0 To dsPaymode.Tables("Pay").Rows.Count - 1
    //   nComputerTotal = nComputerTotal + fnGetText(dgvsales, iRow, cAmount.Index)
    // Next iRow
    let computerTotal = 0;
    const formattedRecords = records.map((row) => {
      const amt = Number(row.Amount) || 0;
      computerTotal += amt;
      return {
        TerminalCode: row.TerminalCode || "1",
        Paymode: row.Paymode || "",
        Amount: amt,
      };
    });

    // Round computer total to 2 decimal places
    computerTotal = Math.round((computerTotal + Number.EPSILON) * 100) / 100;

    return res.status(200).json({
      success: true,
      count: formattedRecords.length,
      data: formattedRecords,
      computerTotal,
    });
  } catch (error) {
    console.error("❌ [TOTAL SALES ERROR]:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to load total sales: " + error.message,
    });
  }
});

module.exports = router;

