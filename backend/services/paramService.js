// ==============================================================================
// Author: JAVITH, BAVANI 11-11-2026
// Project: Supermarket Retail POS
// File: backend/services/paramService.js
// Description: Loads NEW database tblMaParamMaster and Cash Customer Member Code
//              directly during the Cashier Login sequence, matching clsCompany.vb:
//              - SubGetTerminal()
//              - objComp.fncLoadParamMaster()
//              - gsCashCustomerCode = fncGetCashMemberCode()
// ==============================================================================

/**
 * Loads all parameter records from the NEW database tblMaParamMaster table
 * and maps every ParamCode to an application setting dictionary with
 * typed conversion (boolean / numeric / string).
 *
 * @param {object} pool - Active MSSQL connection pool
 * @returns {Promise<object>} Map of ParamCode -> parsed value and raw dictionary
 */
async function loadParamMaster(pool) {
  if (!pool) {
    console.warn("⚠️ [PARAM MASTER] Pool is not connected. Returning empty params.");
    return {
      raw: {},
      params: {},
      loaded: false,
      count: 0,
    };
  }

  try {
    const query = `
      SELECT 
        RTRIM(LTRIM(ISNULL(ParamGroup, ''))) AS ParamGroup,
        RTRIM(LTRIM(ParamCode)) AS ParamCode,
        RTRIM(LTRIM(ISNULL(Description, ''))) AS Description,
        RTRIM(LTRIM(ISNULL(Value, ''))) AS Value
      FROM tblMaParamMaster
    `;

    const result = await pool.request().query(query);
    const records = result.recordset || [];

    const raw = {};
    const params = {};

    for (const record of records) {
      const code = record.ParamCode;
      if (!code) continue;

      const rawVal = record.Value;
      raw[code] = rawVal;

      // Type-aware conversion logic preserving original VB.NET behaviour
      const upper = rawVal.toUpperCase();
      let parsedVal;

      if (upper === "1" || upper === "TRUE" || upper === "Y" || upper === "YES") {
        parsedVal = true;
      } else if (upper === "0" || upper === "FALSE" || upper === "N" || upper === "NO") {
        parsedVal = false;
      } else if (/^-?\d+$/.test(rawVal)) {
        // Integer number
        parsedVal = parseInt(rawVal, 10);
      } else if (/^-?\d+\.\d+$/.test(rawVal)) {
        // Decimal number
        parsedVal = parseFloat(rawVal);
      } else {
        // Text / String value
        parsedVal = rawVal;
      }

      params[code] = parsedVal;
    }

    console.log(`✅ [PARAM MASTER] Successfully loaded ${records.length} parameters from tblMaParamMaster.`);

    return {
      raw,
      params,
      loaded: true,
      count: records.length,
    };
  } catch (err) {
    console.error("❌ [PARAM MASTER ERROR] Failed to load tblMaParamMaster:", err.message);
    return {
      raw: {},
      params: {},
      loaded: false,
      count: 0,
      error: err.message,
    };
  }
}

/**
 * Retrieves the Cash Customer member code matching VB.NET fncGetCashMemberCode():
 * SELECT MemberCode FROM tblMember WHERE UPPER(NRICNo) = 'CASH' OR UPPER(MemberCode) = 'CASH'
 *
 * @param {object} pool - Active MSSQL connection pool
 * @returns {Promise<string>} Cash Customer Code (e.g. 'CASH')
 */
async function fncGetCashMemberCode(pool) {
  if (!pool) return "CASH";

  try {
    const result = await pool.request().query(`
      SELECT TOP 1 
        RTRIM(LTRIM(MemberCode)) AS MemberCode,
        RTRIM(LTRIM(MemberName)) AS MemberName
      FROM tblMember
      WHERE UPPER(RTRIM(LTRIM(NRICNo))) = 'CASH' 
         OR UPPER(RTRIM(LTRIM(MemberCode))) = 'CASH'
    `);

    if (result.recordset && result.recordset.length > 0) {
      return result.recordset[0].MemberCode || "CASH";
    }

    console.warn("⚠️ [CASH MEMBER] CASH customer not found in tblMember. Defaulting to 'CASH'.");
    return "CASH";
  } catch (err) {
    console.warn("⚠️ [CASH MEMBER ERROR] Could not query tblMember for CASH:", err.message);
    return "CASH";
  }
}

module.exports = {
  loadParamMaster,
  fncGetCashMemberCode,
};

