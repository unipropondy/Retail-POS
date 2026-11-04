// ==============================================================================
// Author: JAVITH
// Project: Supermarket Retail POS
// Module: Dynamic DB Location Resolver Service
// File: services/locationService.js
//
// Description:
// Resolves the active LocationCode dynamically directly from MS SQL Database:
// 1. If explicit locationCode provided, validates or cleans it.
// 2. If terminalCode provided, looks up LocationCode from tblmaTerminal.
// 3. Otherwise queries tblMaCompany.LocationCode.
// 4. Fallback checks tblmaLocation (IsActive = 1 or top 1).
// Never hardcodes static strings.
// ==============================================================================

const { sql, getPool } = require('../config/db');

// In-memory cache for fast lookups (invalidated after 5 minutes)
let cachedDefaultLocation = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Resolves the primary location code dynamically from DB.
 * @param {object} pool - mssql pool instance (optional, will fetch if null)
 * @param {string} [terminalCode] - Optional terminal code to resolve terminal location
 * @param {string} [providedLocation] - Optional location passed by client
 * @returns {Promise<string>} Clean resolved LocationCode from DB
 */
async function getDbLocationCode(pool, terminalCode = '', providedLocation = '') {
  const cleanProvided = String(providedLocation || '').trim();
  if (cleanProvided) {
    return cleanProvided;
  }

  const dbPool = pool || (await getPool());
  if (!dbPool) {
    return cleanProvided;
  }

  const cleanTerm = String(terminalCode || '').trim();

  // 1. If terminalCode is provided, resolve from tblmaTerminal
  if (cleanTerm) {
    try {
      const termReq = dbPool.request();
      termReq.input('tCode', sql.VarChar(50), cleanTerm);
      const termRes = await termReq.query(`
        SELECT TOP 1 RTRIM(LTRIM(LocationCode)) AS LocationCode
        FROM tblmaTerminal
        WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@tCode)
      `);
      if (termRes.recordset.length > 0 && termRes.recordset[0].LocationCode) {
        return termRes.recordset[0].LocationCode;
      }
    } catch (e) {
      console.warn('⚠️ [LOCATION SERVICE] Terminal lookup warning:', e.message);
    }
  }

  // 2. Return cached DB default location if still fresh
  const now = Date.now();
  if (cachedDefaultLocation && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedDefaultLocation;
  }

  // 3. Resolve from tblMaCompany
  try {
    const compRes = await dbPool.request().query(`
      SELECT TOP 1 
        RTRIM(LTRIM(LocationCode)) AS LocationCode,
        RTRIM(LTRIM(MainLocationCode)) AS MainLocationCode
      FROM tblMaCompany
    `);
    if (compRes.recordset.length > 0) {
      const row = compRes.recordset[0];
      const loc = row.LocationCode || row.MainLocationCode;
      if (loc) {
        cachedDefaultLocation = loc;
        cacheTimestamp = now;
        return loc;
      }
    }
  } catch (e) {
    console.warn('⚠️ [LOCATION SERVICE] tblMaCompany lookup warning:', e.message);
  }

  // 4. Resolve from tblmaLocation
  try {
    const locRes = await dbPool.request().query(`
      SELECT TOP 1 RTRIM(LTRIM(LocationCode)) AS LocationCode
      FROM tblmaLocation
      ORDER BY CASE WHEN IsActive = '1' OR IsActive = 1 THEN 0 ELSE 1 END, LocationCode
    `);
    if (locRes.recordset.length > 0 && locRes.recordset[0].LocationCode) {
      cachedDefaultLocation = locRes.recordset[0].LocationCode;
      cacheTimestamp = now;
      return cachedDefaultLocation;
    }
  } catch (e) {
    console.warn('⚠️ [LOCATION SERVICE] tblmaLocation lookup warning:', e.message);
  }

  return '';
}

module.exports = {
  getDbLocationCode,
};

