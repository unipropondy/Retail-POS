// ==============================================================================
// Author: JAVITH, BAVANI 11-11-2026 / Updated 12-11-2026
// Project: Supermarket Retail POS
// Module: Member Management Routes (frmMember.vb & clsMember.vb)
// File: backend/routes/memberRoutes.js
// Description: Implements complete VB.NET member methods:
//              - fncGetMember(gsConn, "tbl", code) -> GET /api/members/details/:code
//              - fncGetMemberCode(gsConn, "tbl") -> GET /api/members/code-setting
//              - fncGetNextMemberCode(gsConn, "MEMCOD") -> GET /api/members/next-code
//              - fncCheckMemberExists(gsConn, icNo) -> GET /api/members/check-exists
//              - fncGetMemberType(gsConn, "tbl", typeCode) -> GET /api/members/type/:typeCode
//              - fncMemberSave(...) -> POST /api/members/save (with transaction, validation, M/F, S/M/D/W/O, E/W/C/N/S)
//              - fncGetSalesHeaderByMember(gsConn, "Hdr", memberCode) -> GET /api/members/invoices/:memberCode
//              - fncGetSalesAllByInvoiceNo(gsConn, "Det", invoiceNo) -> GET /api/members/invoice-details/:invoiceNo
//              - fncSearchMember -> GET /api/members/search
//              - fncGetMemberDiscountByBrand -> GET /api/members/discount-by-brand
//              - fncGetSpecialPrice -> GET /api/members/special-price
// ==============================================================================

const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');

// Helper to format Date to YYYY-MM-DD string for MS SQL SmallDateTime
function parseSqlDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// ------------------------------------------------------------------------------
// 1. GET /api/members/types
// Retrieves all active member types from tblMemberType
// ------------------------------------------------------------------------------
router.get('/types', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const result = await pool.request().query(`
      SELECT 
        RTRIM(LTRIM(MemberTypeCode)) AS MemberTypeCode,
        RTRIM(LTRIM(Description)) AS Description,
        ISNULL(CardPrice, 0) AS CardPrice,
        ISNULL(RPPerDollar, 1) AS RPPerDollar,
        ISNULL(Validity, 12) AS Validity,
        ISNULL(Active, 1) AS Active
      FROM [dbo].[tblMemberType] WITH (NOLOCK)
      ORDER BY MemberTypeCode ASC
    `);

    return res.status(200).json({
      success: true,
      types: result.recordset,
    });
  } catch (err) {
    console.error('❌ [MEMBER ERROR - TYPES]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 2. GET /api/members/type/:typeCode
// Equivalent to VB.NET: objMem.fncGetMemberType(gsConn, "tbl", txtMemberType.Text.Trim)
// Retrieves Validity, CardPrice, and Description for calculations
// ------------------------------------------------------------------------------
router.get('/type/:typeCode', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const typeCode = String(req.params.typeCode || '').trim();
    if (!typeCode) {
      return res.status(400).json({ success: false, message: 'Member type code is required' });
    }

    const request = pool.request();
    request.input('memberTypeCode', sql.VarChar(20), typeCode);
    const result = await request.query(`
      SELECT 
        RTRIM(LTRIM(MemberTypeCode)) AS MemberTypeCode,
        RTRIM(LTRIM(Description)) AS Description,
        ISNULL(CardPrice, 0) AS CardPrice,
        ISNULL(RPPerDollar, 1) AS RPPerDollar,
        ISNULL(Validity, 12) AS Validity,
        ISNULL(Active, 1) AS Active
      FROM [dbo].[tblMemberType] WITH (NOLOCK)
      WHERE RTRIM(LTRIM(MemberTypeCode)) = @memberTypeCode
    `);

    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Member type not found.' });
    }

    return res.status(200).json({
      success: true,
      memberType: result.recordset[0],
    });
  } catch (err) {
    console.error('❌ [MEMBER ERROR - GET TYPE]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 3. GET /api/members/code-setting
// Equivalent to VB.NET: objMember.fncGetMemberCode(gsConn, "tbl")
// Checks tblMaParamMaster where ParamCode = 'MEMBERCODEAUTOMANUAL' (1 = Auto, 0 = Manual)
// ------------------------------------------------------------------------------
router.get('/code-setting', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const cfgResult = await pool.request().query(`
      SELECT RTRIM(LTRIM(Value)) AS Value 
      FROM [dbo].[tblMaParamMaster] WITH (NOLOCK) 
      WHERE RTRIM(LTRIM(ParamCode)) = 'MEMBERCODEAUTOMANUAL'
    `);
    const isAuto = cfgResult.recordset.length > 0 && String(cfgResult.recordset[0].Value).trim() === '1';

    return res.status(200).json({
      success: true,
      isAuto,
      value: cfgResult.recordset.length > 0 ? cfgResult.recordset[0].Value : '0',
    });
  } catch (err) {
    console.error('❌ [MEMBER ERROR - CODE SETTING]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 4. GET /api/members/next-code
// Equivalent to VB.NET: objMember.fncGetNextMemberCode(gsConn, "MEMCOD")
// ------------------------------------------------------------------------------
router.get('/next-code', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    // Check configuration
    const cfgResult = await pool.request().query(`
      SELECT RTRIM(LTRIM(Value)) AS Value 
      FROM [dbo].[tblMaParamMaster] WITH (NOLOCK) 
      WHERE RTRIM(LTRIM(ParamCode)) = 'MEMBERCODEAUTOMANUAL'
    `);
    const isAuto = cfgResult.recordset.length > 0 && String(cfgResult.recordset[0].Value).trim() === '1';

    let nextCode = '';
    if (isAuto) {
      const spResult = await pool.request().execute('Sp_GetNextMemberCode');
      if (spResult.recordset && spResult.recordset.length > 0) {
        nextCode = (spResult.recordset[0].MemberCode || '').trim();
      }
    }

    return res.status(200).json({
      success: true,
      isAuto,
      nextCode,
    });
  } catch (err) {
    console.error('❌ [MEMBER ERROR - NEXT CODE]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 5. GET /api/members/check-exists
// Equivalent to VB.NET: objMember.fncCheckMemberExists(gsConn, Trim(txtICNo.Text))
// Checks duplicate IC number / NRIC or MemberCode
// ------------------------------------------------------------------------------
router.get('/check-exists', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const { nricNo, memberCode } = req.query;
    const request = pool.request();

    let existsByNric = false;
    let existsByCode = false;
    let existingMember = null;

    if (nricNo && String(nricNo).trim()) {
      request.input('nric', sql.VarChar(30), String(nricNo).trim());
      const r1 = await request.query(`
        SELECT TOP 1 RTRIM(LTRIM(MemberCode)) AS MemberCode, RTRIM(LTRIM(NricNo)) AS NricNo, RTRIM(LTRIM(MemberName)) AS MemberName
        FROM [dbo].[tblMember] WITH (NOLOCK)
        WHERE RTRIM(LTRIM(NricNo)) = @nric AND RTRIM(LTRIM(MemberCode)) <> 'CASH'
      `);
      if (r1.recordset && r1.recordset.length > 0) {
        existsByNric = true;
        existingMember = r1.recordset[0];
      }
    }

    if (memberCode && String(memberCode).trim()) {
      const req2 = pool.request();
      req2.input('code', sql.VarChar(30), String(memberCode).trim());
      const r2 = await req2.query(`
        SELECT TOP 1 RTRIM(LTRIM(MemberCode)) AS MemberCode, RTRIM(LTRIM(NricNo)) AS NricNo, RTRIM(LTRIM(MemberName)) AS MemberName
        FROM [dbo].[tblMember] WITH (NOLOCK)
        WHERE RTRIM(LTRIM(MemberCode)) = @code AND RTRIM(LTRIM(MemberCode)) <> 'CASH'
      `);
      if (r2.recordset && r2.recordset.length > 0) {
        existsByCode = true;
        if (!existingMember) existingMember = r2.recordset[0];
      }
    }

    return res.status(200).json({
      success: true,
      exists: existsByNric || existsByCode,
      existsByNric,
      existsByCode,
      existingMember,
    });
  } catch (err) {
    console.error('❌ [MEMBER ERROR - CHECK EXISTS]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 6. GET /api/members/details/:code
// Equivalent to VB.NET: objMember.fncGetMember(gsConn, "tbl", txtMemberCode.Text.Trim)
// ------------------------------------------------------------------------------
router.get('/details/:code', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const code = String(req.params.code || '').trim();
    if (!code) {
      return res.status(400).json({ success: false, message: 'Member barcode/code is required' });
    }

    const request = pool.request();
    request.input('MemberBarcode', sql.VarChar(20), code);
    const result = await request.execute('Sp_POS_GetMember');

    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Member '${code}' not found.`,
      });
    }

    const row = result.recordset[0];
    const member = {
      memberCode: (row.MemberCode || '').trim(),
      nricNo: (row.NricNo || '').trim(),
      memberName: (row.MemberName || '').trim(),
      memberType: (row.MemberType || '').trim(),
      address1: (row.Address1 || '').trim(),
      address2: (row.Address2 || '').trim(),
      address3: (row.Address3 || '').trim(),
      street: (row.Street || '').trim(),
      buildingName: (row.BuildingName || '').trim(),
      country: (row.Country || '').trim(),
      zipCode: (row.ZipCode || '').trim(),
      email: (row.eMail || '').trim(),
      resPhone: (row.ResPhone || '').trim(),
      offPhone: (row.OffPhone || '').trim(),
      mobile: (row.Mobile || '').trim(),
      createLocation: (row.CreateLocation || '').trim(),
      dateOfBirth: row.DateOfBirth,
      joinDate: row.JoinDate,
      expiryDate: row.ExpiryDate,
      renewalDate: row.RenewalDate,
      totalSales: Number(row.TotalSales) || 0,
      totalDiscount: Number(row.TotalDiscount) || 0,
      totalRewardPoint: Number(row.TotalRewardPoint) || 0,
      totalUsagePoint: Number(row.TotalUsagePoint) || 0,
      rewardExpiryDate: row.RewardExpiryDate,
      active: Boolean(row.Active),
      memberDiscount: Number(row.MemberDiscount) || 0,
      maritalStatus: (row.MaritalStatus || '').trim(),
      zone: (row.Zone || '').trim(),
      sex: (row.Sex || '').trim(),
      monSalary: Number(row.MonSalary) || 0,
      remarks: (row.Remarks || '').trim(),
      referenceNumber: (row.ReferenceNumber || '').trim(),
      bySMS: Boolean(row.BySMS),
      byEmail: Boolean(row.ByEmail),
      cardPrice: Number(row.CardPrice) || 0,
    };

    return res.status(200).json({
      success: true,
      member,
    });
  } catch (err) {
    console.error('❌ [MEMBER ERROR - DETAILS]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 7. POST /api/members/save
// Equivalent to VB.NET: objMember.fncMemberSave(...) & subSave()
// Requirements:
//   1. Validate required fields (IC No, Member Name, Member Type).
//   2. Check duplicate Member Code if inserting or modifying code.
//   3. Check duplicate NRIC if inserting (Mode = 'I').
//   4. Generate Member Code when automatic generation is enabled and MemberCode is blank.
//   5. Convert Gender into M/F or empty.
//   6. Convert Marital Status into S/M/D/W/O.
//   7. Convert Zone into E/W/C/N/S.
//   8. Use SQL transaction with COMMIT on success and ROLLBACK on failure.
// ------------------------------------------------------------------------------
router.post('/save', async (req, res) => {
  let transaction;
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const b = req.body || {};
    let memberCode = String(b.memberCode || '').trim();
    const nricNo = String(b.nricNo || '').trim();
    const memberName = String(b.memberName || '').trim();
    const memberType = String(b.memberType || 'BASIC MEMB').trim();
    const isEditMode = Boolean(b.isEditMode || b.memberCode);

    // 1. Validation
    if (!nricNo) {
      return res.status(400).json({ success: false, message: 'Please key in the member IC / NRIC number.' });
    }
    if (!memberName) {
      return res.status(400).json({ success: false, message: 'Please key in the member name.' });
    }
    if (!memberType) {
      return res.status(400).json({ success: false, message: 'Please key in the member type.' });
    }

    // 2. Normalize Enums
    // Gender: M / F / ''
    let sGender = '';
    const rawSex = String(b.sex || '').trim().toUpperCase();
    if (rawSex === 'M' || rawSex === 'MALE') sGender = 'M';
    else if (rawSex === 'F' || rawSex === 'FEMALE') sGender = 'F';

    // Marital Status: S / M / D / W / O
    let sMaritalStatus = ' ';
    const rawMarital = String(b.maritalStatus || '').trim().toLowerCase();
    if (rawMarital === 'single' || rawMarital === 's') sMaritalStatus = 'S';
    else if (rawMarital === 'married' || rawMarital === 'm') sMaritalStatus = 'M';
    else if (rawMarital === 'divorced' || rawMarital === 'd') sMaritalStatus = 'D';
    else if (rawMarital === 'widowed' || rawMarital === 'w') sMaritalStatus = 'W';
    else if (rawMarital === 'others' || rawMarital === 'o') sMaritalStatus = 'O';

    // Zone: E / W / C / N / S
    let sZone = ' ';
    const rawZone = String(b.zone || '').trim().toLowerCase();
    if (rawZone === 'east' || rawZone === 'e') sZone = 'E';
    else if (rawZone === 'west' || rawZone === 'w') sZone = 'W';
    else if (rawZone === 'central' || rawZone === 'c') sZone = 'C';
    else if (rawZone === 'north' || rawZone === 'n') sZone = 'N';
    else if (rawZone === 'south' || rawZone === 's') sZone = 'S';

    // Active flag
    const nActive = b.active !== false ? 1 : 0;

    // Dates
    const dob = parseSqlDate(b.dateOfBirth);
    const joinDt = parseSqlDate(b.joinDate) || new Date();
    const expiryDt = parseSqlDate(b.expiryDate);
    const renewalDt = parseSqlDate(b.renewalDate) || expiryDt;
    const rewardExpiryDt = parseSqlDate(b.rewardExpiryDate) || expiryDt;

    // Begin Database Transaction
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Check Auto Code Generation if memberCode is blank
    if (!memberCode) {
      const cfgReq = new sql.Request(transaction);
      const cfgRes = await cfgReq.query(`
        SELECT RTRIM(LTRIM(Value)) AS Value 
        FROM [dbo].[tblMaParamMaster] WITH (UPDLOCK) 
        WHERE RTRIM(LTRIM(ParamCode)) = 'MEMBERCODEAUTOMANUAL'
      `);
      const isAuto = cfgRes.recordset.length > 0 && String(cfgRes.recordset[0].Value).trim() === '1';

      if (isAuto) {
        const nextReq = new sql.Request(transaction);
        const nextRes = await nextReq.execute('Sp_GetNextMemberCode');
        if (nextRes.recordset && nextRes.recordset.length > 0) {
          memberCode = (nextRes.recordset[0].MemberCode || '').trim();
        }
      } else {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Please enter Member Code (manual generation enabled).' });
      }
    }

    // Check duplicate NRIC if inserting (Mode = 'I')
    if (!isEditMode) {
      const checkNricReq = new sql.Request(transaction);
      checkNricReq.input('chkNric', sql.VarChar(30), nricNo);
      const checkNricRes = await checkNricReq.query(`
        SELECT TOP 1 MemberCode, MemberName 
        FROM [dbo].[tblMember] WITH (NOLOCK) 
        WHERE RTRIM(LTRIM(NricNo)) = @chkNric AND RTRIM(LTRIM(MemberCode)) <> 'CASH'
      `);
      if (checkNricRes.recordset && checkNricRes.recordset.length > 0) {
        await transaction.rollback();
        return res.status(409).json({
          success: false,
          message: `NRIC '${nricNo}' already exists for member: ${checkNricRes.recordset[0].MemberName} (${checkNricRes.recordset[0].MemberCode.trim()}).`,
        });
      }
    }

    // Check if member already exists by MemberCode
    const checkCodeReq = new sql.Request(transaction);
    checkCodeReq.input('chkCode', sql.VarChar(30), memberCode);
    const checkCodeRes = await checkCodeReq.query(`
      SELECT TOP 1 MemberCode, NricNo 
      FROM [dbo].[tblMember] WITH (NOLOCK) 
      WHERE RTRIM(LTRIM(MemberCode)) = @chkCode
    `);
    const existsInDb = checkCodeRes.recordset && checkCodeRes.recordset.length > 0;

    const spReq = new sql.Request(transaction);
    spReq.input('MemberCode', sql.VarChar(20), memberCode);
    spReq.input('NricNo', sql.VarChar(20), nricNo);
    spReq.input('MemberName', sql.VarChar(50), memberName);
    spReq.input('MemberType', sql.VarChar(20), memberType);
    spReq.input('Address1', sql.VarChar(50), String(b.address1 || '').trim());
    spReq.input('Address2', sql.VarChar(50), String(b.address2 || '').trim());
    spReq.input('Address3', sql.VarChar(50), String(b.address3 || '').trim());
    spReq.input('Country', sql.VarChar(50), String(b.country || '').trim());
    spReq.input('ZipCode', sql.VarChar(50), String(b.zipCode || '').trim());
    spReq.input('eMail', sql.VarChar(50), String(b.email || '').trim());
    spReq.input('ResPhone', sql.VarChar(20), String(b.resPhone || '').trim());
    spReq.input('OffPhone', sql.VarChar(20), String(b.offPhone || '').trim());
    spReq.input('Mobile', sql.VarChar(20), String(b.mobile || '').trim());
    spReq.input('CreateLocation', sql.VarChar(10), String(b.createLocation || 'HQ').trim());
    spReq.input('DateOfBirth', sql.SmallDateTime, dob);
    spReq.input('JoinDate', sql.SmallDateTime, joinDt);
    spReq.input('ExpiryDate', sql.SmallDateTime, expiryDt);
    spReq.input('Active', sql.Int, nActive);
    spReq.input('MaritalStatus', sql.VarChar(10), sMaritalStatus);
    spReq.input('Zone', sql.VarChar(10), sZone);
    spReq.input('Sex', sql.VarChar(10), sGender);
    spReq.input('MonSalary', sql.Decimal(18, 2), Number(b.monSalary) || 0);
    spReq.input('Remarks', sql.VarChar(200), String(b.remarks || '').trim());
    spReq.input('ReferenceNumber', sql.VarChar(50), String(b.referenceNumber || '').trim());
    spReq.input('User', sql.VarChar(10), String(b.user || 'UPS').trim());
    spReq.input('ByEmail', sql.Bit, b.byEmail ? 1 : 0);
    spReq.input('BySms', sql.Bit, b.bySMS ? 1 : 0);

    // Execute standard VB.NET sp_Pos_MemberSave
    await spReq.execute('sp_Pos_MemberSave');

    // Also update RenewalDate and RewardExpiryDate if provided (matching Stephina 20150326 fix)
    if (renewalDt || rewardExpiryDt) {
      const extraReq = new sql.Request(transaction);
      extraReq.input('mCode', sql.VarChar(20), memberCode);
      extraReq.input('renewalDt', sql.SmallDateTime, renewalDt);
      extraReq.input('rewardExpiryDt', sql.SmallDateTime, rewardExpiryDt);
      await extraReq.query(`
        UPDATE [dbo].[tblMember]
        SET RenewalDate = ISNULL(@renewalDt, RenewalDate),
            RewardExpiryDate = ISNULL(@rewardExpiryDt, RewardExpiryDate)
        WHERE RTRIM(LTRIM(MemberCode)) = @mCode
      `);
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: existsInDb ? 'Updated Successfully' : 'Saved Successfully',
      memberCode,
      memberName,
      isEdit: existsInDb,
    });
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }
    console.error('❌ [MEMBER ERROR - SAVE]:', err.message);
    return res.status(500).json({ success: false, message: 'Error in Header Save: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 8. GET /api/members/invoices/:memberCode
// Equivalent to VB.NET: objSales.fncGetSalesHeaderByMember(gsConn, "Hdr", sMemberCode)
// Returns previous invoice headers for a member from tblPOSSalesHeaderCur and tblPOSSalesHeader
// ------------------------------------------------------------------------------
router.get('/invoices/:memberCode', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const memberCode = String(req.params.memberCode || '').trim();
    if (!memberCode) {
      return res.status(400).json({ success: false, message: 'Member code is required.' });
    }

    const request = pool.request();
    request.input('mCode', sql.VarChar(30), memberCode);

    // Queries both active current shift and historical sales headers
    const query = `
      SELECT 
        RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
        CreateDate,
        RTRIM(LTRIM(ISNULL(CashierID, ''))) AS CashierID,
        RTRIM(LTRIM(ISNULL(CustomerCode, ''))) AS CustomerCode,
        CAST(ROUND(ISNULL(NetTotal, 0), 2) AS DECIMAL(18, 2)) AS NetTotal
      FROM [dbo].[tblPOSSalesHeaderCur] WITH (NOLOCK)
      WHERE RTRIM(LTRIM(CustomerCode)) = @mCode

      UNION ALL

      SELECT 
        RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
        CreateDate,
        RTRIM(LTRIM(ISNULL(CashierID, ''))) AS CashierID,
        RTRIM(LTRIM(ISNULL(CustomerCode, ''))) AS CustomerCode,
        CAST(ROUND(ISNULL(NetTotal, 0), 2) AS DECIMAL(18, 2)) AS NetTotal
      FROM [dbo].[tblPOSSalesHeader] WITH (NOLOCK)
      WHERE RTRIM(LTRIM(CustomerCode)) = @mCode

      ORDER BY CreateDate DESC
    `;

    const result = await request.query(query);

    return res.status(200).json({
      success: true,
      count: result.recordset.length,
      invoices: result.recordset,
    });
  } catch (err) {
    console.error('❌ [MEMBER ERROR - INVOICES]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 9. GET /api/members/invoice-details/:invoiceNo
// Equivalent to VB.NET: objSales.fncGetSalesAllByInvoiceNo(gsConn, "Det", sInvoiceNo)
// Returns line items for selected invoice from tblPOSSalesDetailCur and tblPOSSalesDetail
// ------------------------------------------------------------------------------
router.get('/invoice-details/:invoiceNo', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const invoiceNo = String(req.params.invoiceNo || '').trim();
    if (!invoiceNo) {
      return res.status(400).json({ success: false, message: 'Invoice number is required.' });
    }

    const request = pool.request();
    request.input('invNo', sql.VarChar(30), invoiceNo);

    const query = `
      SELECT 
        RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
        RTRIM(LTRIM(ISNULL(InventoryCode, ''))) AS InventoryCode,
        ISNULL(Qty, 0) AS Qty,
        RTRIM(LTRIM(ISNULL(Description, ''))) AS Description,
        CAST(ROUND(ISNULL(NetAmount, 0), 2) AS DECIMAL(18, 2)) AS NetAmount
      FROM [dbo].[tblPOSSalesDetailCur] WITH (NOLOCK)
      WHERE RTRIM(LTRIM(InvoiceNo)) = @invNo

      UNION ALL

      SELECT 
        RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
        RTRIM(LTRIM(ISNULL(InventoryCode, ''))) AS InventoryCode,
        ISNULL(Qty, 0) AS Qty,
        RTRIM(LTRIM(ISNULL(Description, ''))) AS Description,
        CAST(ROUND(ISNULL(NetAmount, 0), 2) AS DECIMAL(18, 2)) AS NetAmount
      FROM [dbo].[tblPOSSalesDetail] WITH (NOLOCK)
      WHERE RTRIM(LTRIM(InvoiceNo)) = @invNo
    `;

    const result = await request.query(query);

    return res.status(200).json({
      success: true,
      count: result.recordset.length,
      items: result.recordset,
    });
  } catch (err) {
    console.error('❌ [MEMBER ERROR - INVOICE DETAILS]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 10. GET /api/members/discount-by-brand
// Matching clsMember.vb GetMemberDiscountByBrand (tblMemberDiscount)
// ------------------------------------------------------------------------------
router.get('/discount-by-brand', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const memberType = String(req.query.memberType || '').trim();
    const brandCode = String(req.query.brandCode || '').trim();

    if (!memberType || !brandCode) {
      return res.status(400).json({ success: false, message: 'memberType and brandCode are required' });
    }

    const request = pool.request();
    request.input('MemberType', sql.VarChar(20), memberType);
    request.input('BrandCode', sql.VarChar(20), brandCode);

    const result = await request.query(`
      SELECT TOP 1 Discount
      FROM tblMemberDiscount WITH (NOLOCK)
      WHERE RTRIM(LTRIM(MemberType)) = @MemberType 
        AND RTRIM(LTRIM(BrandCode)) = @BrandCode
        AND Active = 1
    `);

    const discount = result.recordset.length > 0 ? Number(result.recordset[0].Discount) : 0;

    return res.status(200).json({
      success: true,
      discount,
    });
  } catch (err) {
    console.error('❌ [MEMBER ERROR - DISCOUNT BY BRAND]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 11. GET /api/members/special-price
// Matching clsMember.vb fncCheckMemberPrice (tblInventoryMemberPrice)
// ------------------------------------------------------------------------------
router.get('/special-price', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const memberType = String(req.query.memberType || '').trim();
    const inventoryCode = String(req.query.inventoryCode || '').trim();

    if (!memberType || !inventoryCode) {
      return res.status(400).json({ success: false, message: 'memberType and inventoryCode are required' });
    }

    const request = pool.request();
    request.input('MemberType', sql.VarChar(20), memberType);
    request.input('InventoryCode', sql.VarChar(30), inventoryCode);

    const result = await request.query(`
      SELECT TOP 1 RetailPrice
      FROM tblInventoryMemberPrice WITH (NOLOCK)
      WHERE RTRIM(LTRIM(MemberType)) = @MemberType 
        AND RTRIM(LTRIM(InventoryCode)) = @InventoryCode
        AND Active = 1
    `);

    const price = result.recordset.length > 0 ? Number(result.recordset[0].RetailPrice) : null;

    return res.status(200).json({
      success: true,
      hasSpecialPrice: price !== null,
      price,
    });
  } catch (err) {
    console.error('❌ [MEMBER ERROR - SPECIAL PRICE]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 12. GET /api/members/search
// Find Member screen search matching frmMemberSearch.vb & clsMember.vb:
// Filters: query, mode ('STARTS_WITH', 'EXACT', 'CONTAINS')
// ------------------------------------------------------------------------------
router.get('/search', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const q = String(req.query.query || '').trim();
    const mode = String(req.query.mode || 'CONTAINS').trim().toUpperCase();

    const request = pool.request();
    let whereClause = "WHERE RTRIM(LTRIM(MemberCode)) != 'CASH'";

    if (q) {
      request.input('q', sql.VarChar(100), q);

      if (mode === 'EXACT') {
        whereClause += ` AND (
          UPPER(RTRIM(LTRIM(MemberName))) = UPPER(@q)
          OR RTRIM(LTRIM(Mobile)) = @q
          OR RTRIM(LTRIM(ResPhone)) = @q
          OR RTRIM(LTRIM(OffPhone)) = @q
          OR UPPER(RTRIM(LTRIM(MemberCode))) = UPPER(@q)
          OR UPPER(RTRIM(LTRIM(NricNo))) = UPPER(@q)
        )`;
      } else if (mode === 'STARTS_WITH') {
        request.input('qLike', sql.VarChar(102), `${q}%`);
        whereClause += ` AND (
          MemberName LIKE @qLike
          OR Mobile LIKE @qLike
          OR ResPhone LIKE @qLike
          OR OffPhone LIKE @qLike
          OR MemberCode LIKE @qLike
          OR NricNo LIKE @qLike
        )`;
      } else {
        request.input('qLike', sql.VarChar(102), `%${q}%`);
        whereClause += ` AND (
          MemberName LIKE @qLike
          OR Mobile LIKE @qLike
          OR ResPhone LIKE @qLike
          OR OffPhone LIKE @qLike
          OR MemberCode LIKE @qLike
          OR NricNo LIKE @qLike
        )`;
      }
    }

    const sqlQuery = `
      SELECT TOP 200
        RTRIM(LTRIM(MemberCode)) AS MemberCode,
        RTRIM(LTRIM(MemberName)) AS MemberName,
        RTRIM(LTRIM(ISNULL(MemberType, ''))) AS MemberType,
        RTRIM(LTRIM(COALESCE(NULLIF(Mobile, ''), NULLIF(ResPhone, ''), NULLIF(OffPhone, ''), ''))) AS PhoneNo,
        RTRIM(LTRIM(ISNULL(Mobile, ''))) AS Mobile,
        RTRIM(LTRIM(ISNULL(ResPhone, ''))) AS ResPhone,
        RTRIM(LTRIM(ISNULL(OffPhone, ''))) AS OffPhone,
        RTRIM(LTRIM(ISNULL(NricNo, ''))) AS NricNo,
        RTRIM(LTRIM(ISNULL(Address1, ''))) AS Address1,
        RTRIM(LTRIM(ISNULL(Address2, ''))) AS Address2,
        RTRIM(LTRIM(ISNULL(Address3, ''))) AS Address3,
        ISNULL(Active, 1) AS Active
      FROM [dbo].[tblMember] WITH (NOLOCK)
      ${whereClause}
      ORDER BY MemberName ASC, MemberCode ASC
    `;

    const result = await request.query(sqlQuery);

    return res.status(200).json({
      success: true,
      mode,
      members: result.recordset,
    });
  } catch (err) {
    console.error('❌ [MEMBER ERROR - SEARCH]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
