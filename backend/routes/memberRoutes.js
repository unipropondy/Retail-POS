// ==============================================================================
// Author: JAVITH, BAVANI 11-11-2026
// Project: Supermarket Retail POS
// File: backend/routes/memberRoutes.js
// Description: Member management endpoints matching clsMember.vb:
//              - Sp_POS_GetMember (Member lookup & details by code or NRIC)
//              - Sp_GetNextMemberCode (Next auto member code)
//              - tblMemberType (Member types list & details)
//              - tblMaParamMaster MEMBERCODEAUTOMANUAL parameter
//              - sp_Pos_MemberSave (Create or update member)
//              - tblInvDepartment (Department discount)
//              - tblInventory (AllowReward = 1 check)
//              - tblMemberDiscount (Member discount by type/brand)
//              - tblInventoryMemberPrice (Special member price)
// ==============================================================================

const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');

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
      FROM tblMemberType
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
// 2. GET /api/members/next-code
// Retrieves next generated member code from Sp_GetNextMemberCode
// Also checks tblMaParamMaster where ParamCode = 'MEMBERCODEAUTOMANUAL'
// ------------------------------------------------------------------------------
router.get('/next-code', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    // Check configuration
    const cfgResult = await pool.request().query(`
      SELECT RTRIM(LTRIM(Value)) AS Value 
      FROM tblMaParamMaster 
      WHERE ParamCode = 'MEMBERCODEAUTOMANUAL'
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
// 3. GET /api/members/details/:code
// Executes Sp_POS_GetMember to load all available member details by MemberCode or NRIC
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
// 4. POST /api/members/save
// Executes sp_Pos_MemberSave matching clsMember.vb fncMemberSave
// ------------------------------------------------------------------------------
router.post('/save', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const b = req.body || {};
    const memberCode = String(b.memberCode || '').trim();
    const nricNo = String(b.nricNo || '').trim();
    const memberName = String(b.memberName || '').trim();
    const memberType = String(b.memberType || 'BASIC MEMB').trim();

    if (!nricNo) {
      return res.status(400).json({ success: false, message: 'NRIC / ID Number is required.' });
    }
    if (!memberName) {
      return res.status(400).json({ success: false, message: 'Member Name is required.' });
    }

    const spReq = pool.request();
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
    spReq.input('DateOfBirth', sql.SmallDateTime, b.dateOfBirth ? new Date(b.dateOfBirth) : null);
    spReq.input('JoinDate', sql.SmallDateTime, b.joinDate ? new Date(b.joinDate) : new Date());
    spReq.input('ExpiryDate', sql.SmallDateTime, b.expiryDate ? new Date(b.expiryDate) : null);
    spReq.input('Active', sql.Int, b.active !== false ? 1 : 0);
    spReq.input('MaritalStatus', sql.VarChar(10), String(b.maritalStatus || ' ').trim());
    spReq.input('Zone', sql.VarChar(10), String(b.zone || ' ').trim());
    spReq.input('Sex', sql.VarChar(10), String(b.sex || ' ').trim());
    spReq.input('MonSalary', sql.Decimal(18, 2), Number(b.monSalary) || 0);
    spReq.input('Remarks', sql.VarChar(200), String(b.remarks || '').trim());
    spReq.input('ReferenceNumber', sql.VarChar(50), String(b.referenceNumber || '').trim());
    spReq.input('User', sql.VarChar(10), String(b.user || 'UPS').trim());
    spReq.input('ByEmail', sql.Bit, b.byEmail ? 1 : 0);
    spReq.input('BySms', sql.Bit, b.bySMS ? 1 : 0);

    await spReq.execute('sp_Pos_MemberSave');

    // Retrieve saved member row to return confirmation
    const verifyReq = pool.request();
    verifyReq.input('MemberBarcode', sql.VarChar(20), memberCode || nricNo);
    const verifyRes = await verifyReq.execute('Sp_POS_GetMember');

    let savedMember = null;
    if (verifyRes.recordset && verifyRes.recordset.length > 0) {
      const row = verifyRes.recordset[0];
      savedMember = {
        memberCode: (row.MemberCode || '').trim(),
        nricNo: (row.NricNo || '').trim(),
        memberName: (row.MemberName || '').trim(),
        memberType: (row.MemberType || '').trim(),
      };
    }

    return res.status(200).json({
      success: true,
      message: 'Member details saved successfully.',
      member: savedMember,
    });
  } catch (err) {
    console.error('❌ [MEMBER ERROR - SAVE]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 5. GET /api/members/discount-by-brand
// Matching clsMember.vb GetMemberDiscountByBrand (tblMemberDiscount)
// ------------------------------------------------------------------------------
router.get('/discount-by-brand', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const memberType = String(req.query.memberType || '').trim();
    const reqQ = pool.request();
    reqQ.input('memType', sql.VarChar(50), memberType);

    const result = await reqQ.query(`
      SELECT 
        RTRIM(LTRIM(MemberType)) AS MemberType,
        RTRIM(LTRIM(MasterType)) AS MasterType,
        RTRIM(LTRIM(MasterCode)) AS MasterCode,
        ISNULL(DiscountPrice, 0) AS DiscountPrice,
        ISNULL(RPPerDollar, 0) AS RPPerDollar
      FROM tblMemberDiscount
      WHERE RTRIM(LTRIM(MemberType)) = @memType
    `);

    return res.status(200).json({
      success: true,
      discounts: result.recordset,
    });
  } catch (err) {
    console.error('❌ [MEMBER ERROR - BRAND DISCOUNT]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 6. GET /api/members/special-price
// Matching clsMember.vb GetInventoryMemberPrice (tblInventoryMemberPrice)
// ------------------------------------------------------------------------------
router.get('/special-price', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const inventoryCode = String(req.query.inventoryCode || '').trim();
    const memberCode = String(req.query.memberCode || '').trim();

    const reqQ = pool.request();
    reqQ.input('invCode', sql.VarChar(50), inventoryCode);
    reqQ.input('memCode', sql.VarChar(50), memberCode);

    const result = await reqQ.query(`
      SELECT RetailPrice 
      FROM tblInventoryMemberPrice 
      WHERE MemberType IN (SELECT MemberType FROM tblMember WHERE RTRIM(LTRIM(MemberCode)) = @memCode)
        AND RTRIM(LTRIM(InventoryCode)) = @invCode
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
// 7. GET /api/members/search
// Find Member screen search matching frmMemberSearch.vb & clsMember.vb:
// Filters:
//   - query: string to match Name or Phone No (Mobile / ResPhone / OffPhone) or MemberCode
//   - mode: 'STARTS_WITH' (F1), 'EXACT' (F2), or 'CONTAINS' (F3, default)
// Grid columns:
//   - Member Code, Name, Member Type, Phone No
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
        // F2 Exact match
        whereClause += ` AND (
          UPPER(RTRIM(LTRIM(MemberName))) = UPPER(@q)
          OR RTRIM(LTRIM(Mobile)) = @q
          OR RTRIM(LTRIM(ResPhone)) = @q
          OR RTRIM(LTRIM(OffPhone)) = @q
          OR UPPER(RTRIM(LTRIM(MemberCode))) = UPPER(@q)
          OR UPPER(RTRIM(LTRIM(NricNo))) = UPPER(@q)
        )`;
      } else if (mode === 'STARTS_WITH') {
        // F1 Starts with match
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
        // F3 Contains match (Default)
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
      FROM tblMember
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


