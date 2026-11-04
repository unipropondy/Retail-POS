// ==============================================================================
// Author: Antigravity
// Module: Salesman Determination Service
// Description: Determines whether a line item requires a salesman and computes
//              the appropriate Salesman value based on:
//              1. tblMaParamMaster (Value = '1' for SALESMAN REQUIRED)
//              2. tblMaUserMaster (IsSalesMan = 1)
//              3. tblInventory (SalesmanRequired = 1)
//              4. tblInvDepartment (SalesmanRequired = 1)
// Expected Behaviour:
//              - If SalesmanRequired = 1: User Name (cashier/user where IsSalesMan = 1)
//              - If SalesmanRequired = 0: Location Name (from tblMaLocation)
// ==============================================================================

const { sql } = require('../config/db');

/**
 * Resolves the salesman text for an item according to the 4 strict rules.
 *
 * @param {object} pool - MSSQL Connection Pool
 * @param {object} options
 * @param {string} [options.inventoryCode] - Item SKU/Inventory Code
 * @param {string} [options.departmentCode] - Department Code if known
 * @param {boolean|number} [options.itemSalesmanRequired] - If already fetched from tblInventory
 * @param {string} [options.cashierId] - Current logged in cashier/user (default 'UPS')
 * @param {string} [options.terminalCode] - Current terminal code (e.g. 'HQPC1')
 * @param {string} [options.locationCode] - Current location code (e.g. 'HQ')
 * @returns {Promise<{ salesman: string, isSalesmanRequired: boolean, locationName: string, userName: string }>}
 */
async function resolveSalesmanValue(pool, options = {}) {
  const {
    inventoryCode = '',
    departmentCode = '',
    itemSalesmanRequired = null,
    cashierId = '',
    terminalCode = '',
    locationCode = '',
  } = options;

  let effectiveLocationName = '';
  let effectiveUserName = '';
  let paramSalesmanRequired = false;
  let isInvSalesmanRequired = false;
  let isDeptSalesmanRequired = false;

  try {
    const req = pool.request();
    const invCode = String(inventoryCode || '').trim();
    const deptCode = String(departmentCode || '').trim();
    const cId = String(cashierId || '').trim();
    const termCode = String(terminalCode || '').trim();
    const locCode = String(locationCode || '').trim();

    req.input('invCode', sql.VarChar(50), invCode);
    req.input('deptCode', sql.VarChar(50), deptCode);
    req.input('cId', sql.VarChar(50), cId);
    req.input('termCode', sql.VarChar(20), termCode);
    req.input('locCode', sql.VarChar(20), locCode);

    // Run unified query to gather all 4 conditions and location name from the database:
    const query = `
      -- 1. Check tblMaParamMaster where Value = 1 for SALESMAN REQUIRED
      SELECT TOP 1 RTRIM(LTRIM(ISNULL(Value, '0'))) AS ParamVal
      FROM tblMaParamMaster
      WHERE (UPPER(RTRIM(LTRIM(ParamCode))) = 'SALESMAN REQUIRED' 
             OR UPPER(RTRIM(LTRIM(ParamCode))) LIKE '%SALESMAN%')
        AND RTRIM(LTRIM(Value)) = '1';

      -- 2. Check tblMaUserMaster where IsSalesMan = 1
      SELECT TOP 1 
        RTRIM(LTRIM(ISNULL(UserName, UserCode))) AS UserName,
        ISNULL(IsSalesMan, 0) AS IsSalesMan
      FROM tblMaUserMaster
      WHERE (UPPER(RTRIM(LTRIM(UserCode))) = UPPER(@cId)
         OR UPPER(RTRIM(LTRIM(UserName))) = UPPER(@cId))
        AND (@cId <> '');

      -- Fallback if current user is not marked IsSalesMan=1: find default active salesman
      SELECT TOP 1 
        RTRIM(LTRIM(ISNULL(UserName, UserCode))) AS DefaultSalesMan
      FROM tblMaUserMaster
      WHERE IsSalesMan = 1;

      -- 3. Check tblInventory where SalesmanRequired = 1
      SELECT TOP 1 
        ISNULL(SalesmanRequired, 0) AS InvSalesmanRequired,
        RTRIM(LTRIM(ISNULL(DepartmentCode, ''))) AS ItemDeptCode
      FROM tblInventory
      WHERE UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@invCode);

      -- 4. Check tblInvDepartment where SalesmanRequired = 1
      SELECT TOP 1 
        ISNULL(SalesManRequired, 0) AS DeptSalesmanRequired
      FROM tblInvDepartment
      WHERE UPPER(RTRIM(LTRIM(DeptCode))) = UPPER(@deptCode)
         OR UPPER(RTRIM(LTRIM(DeptName))) = UPPER(@deptCode);

      -- 5. Location Name resolution from tblMaLocation, tblmaTerminal, or tblMaCompany
      SELECT TOP 1 
        RTRIM(LTRIM(ISNULL(LocationName, LocationCode))) AS LocationName
      FROM tblMaLocation
      WHERE (UPPER(RTRIM(LTRIM(LocationCode))) = UPPER(@locCode) AND @locCode <> '')
         OR UPPER(RTRIM(LTRIM(LocationCode))) IN (
              SELECT UPPER(RTRIM(LTRIM(LocationCode))) 
              FROM tblmaTerminal 
              WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@termCode) AND @termCode <> ''
         );
    `;

    const res = await req.query(query);

    // 1. Param master check
    const paramRow = res.recordsets[0]?.[0];
    if (paramRow && String(paramRow.ParamVal).trim() === '1') {
      paramSalesmanRequired = true;
    }

    // 2. User master check
    const userRow = res.recordsets[1]?.[0];
    const defaultSalesmanRow = res.recordsets[2]?.[0];
    
    // Check if the current user has IsSalesMan = 1
    const currentUserIsSalesMan = userRow && (userRow.IsSalesMan === true || userRow.IsSalesMan === 1);
    
    if (currentUserIsSalesMan) {
      effectiveUserName = userRow.UserName;
    } else {
      // Current user is NOT a salesman (IsSalesMan = 0)
      effectiveUserName = '';
    }

    // 3. Inventory item check
    const invRow = res.recordsets[3]?.[0];
    if (itemSalesmanRequired !== null && itemSalesmanRequired !== undefined) {
      isInvSalesmanRequired = Boolean(itemSalesmanRequired);
    } else if (invRow) {
      isInvSalesmanRequired = invRow.InvSalesmanRequired === 1 || invRow.InvSalesmanRequired === true;
    }

    // 4. Department check
    const resolvedDeptCode = deptCode || invRow?.ItemDeptCode || '';
    let deptRow = res.recordsets[4]?.[0];
    if (!deptRow && resolvedDeptCode) {
      // If deptCode wasn't passed initially but found from tblInventory, query department
      const dReq = pool.request();
      dReq.input('dCode', sql.VarChar(50), resolvedDeptCode);
      const dRes = await dReq.query(`
        SELECT TOP 1 ISNULL(SalesManRequired, 0) AS DeptSalesmanRequired
        FROM tblInvDepartment
        WHERE UPPER(RTRIM(LTRIM(DeptCode))) = UPPER(@dCode)
           OR UPPER(RTRIM(LTRIM(DeptName))) = UPPER(@dCode);
      `);
      deptRow = dRes.recordset[0];
    }
    if (deptRow && (deptRow.DeptSalesmanRequired === 1 || deptRow.DeptSalesmanRequired === true)) {
      isDeptSalesmanRequired = true;
    }

    // 5. Location Name resolution
    const locRow = res.recordsets[5]?.[0];
    if (locRow && locRow.LocationName) {
      effectiveLocationName = locRow.LocationName;
    } else {
      // Query database for location from tblMaCompany or active tblMaLocation
      const dbLoc = await pool.request().query(`
        SELECT TOP 1 RTRIM(LTRIM(ISNULL(LocationCode, ''))) AS LocationCode FROM tblMaCompany;
        SELECT TOP 1 RTRIM(LTRIM(ISNULL(LocationName, LocationCode))) AS LocationName FROM tblMaLocation WHERE IsActive = '1' OR IsActive = 1;
      `);
      effectiveLocationName = dbLoc.recordsets[0]?.[0]?.LocationCode || dbLoc.recordsets[1]?.[0]?.LocationName || '';
    }
  } catch (err) {
    console.error('Error resolving salesman value:', err.message);
  }

  // Evaluate conditions:
  // Item or Department requires salesman (SalesmanRequired = 1)
  const isRequired = (isInvSalesmanRequired || isDeptSalesmanRequired);

  // Expected Behaviour:
  // 1. If SalesmanRequired = 1:
  //    Display the User Name (if user has IsSalesMan = 1; otherwise location name or user name)
  // 2. If SalesmanRequired = 0:
  //    Display the Location Name.
  let finalSalesmanValue = effectiveLocationName;
  if (isRequired) {
    finalSalesmanValue = effectiveUserName || effectiveLocationName;
  } else {
    finalSalesmanValue = effectiveLocationName;
  }

  return {
    salesman: finalSalesmanValue,
    isSalesmanRequired: isRequired,
    locationName: effectiveLocationName,
    userName: effectiveUserName,
    paramSalesmanRequired,
    isInvSalesmanRequired,
    isDeptSalesmanRequired,
  };
}

module.exports = {
  resolveSalesmanValue,
};

