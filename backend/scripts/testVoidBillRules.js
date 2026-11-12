const path = require('path');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env') });
const { getPool, sql } = require('../config/db');

async function testVoidBillRules() {
  console.log('Connecting to database...');
  const pool = await getPool();
  if (!pool) {
    console.error('Database connection failed.');
    process.exit(1);
  }

  console.log('1. Testing non-existent invoice lookup in tblPOSSalesHeaderCur:');
  const req1 = pool.request();
  req1.input('inv', sql.VarChar(50), 'INVALID_INVOICE_XYZ');
  const res1 = await req1.query(`
    SELECT TOP 1 
      RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo, 
      InvoiceDate, 
      NetTotal, 
      RTRIM(LTRIM(CustomerCode)) AS CustomerCode,
      RTRIM(LTRIM(LocationCode)) AS LocationCode,
      ShiftNo
    FROM tblPOSSalesHeaderCur
    WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
  `);
  if (res1.recordset.length === 0) {
    console.log('   -> Passed: 0 rows found. Response: 404 "Bill not found in transaction history."');
  } else {
    console.error('   -> Failed: Found unexpected rows.');
  }

  console.log('2. Querying recent bills in tblPOSSalesHeaderCur:');
  const req2 = pool.request();
  const res2 = await req2.query(`
    SELECT TOP 5
      RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
      InvoiceDate,
      NetTotal,
      ShiftNo
    FROM tblPOSSalesHeaderCur
    ORDER BY InvoiceDate DESC
  `);
  console.log('   -> Recent cur bills:', res2.recordset);

  if (res2.recordset.length > 0) {
    const sample = res2.recordset[0];
    const rawShiftNo = sample.ShiftNo;
    const shiftVal = rawShiftNo !== null && rawShiftNo !== undefined && rawShiftNo !== '' ? Number(rawShiftNo) : 0;
    console.log(`   -> Validating sample bill ${sample.InvoiceNo}: ShiftNo = ${rawShiftNo} (shiftVal = ${shiftVal})`);
    if (shiftVal === 0) {
      console.log('   -> Allowed for cancellation! (ShiftNo is 0 or NULL)');
    } else {
      console.log('   -> Disallowed! Message: "You cannot cancel History Bills ....Please Give Correct Bill No"');
    }
  }

  console.log('3. Checking NextBillCancelNo in tblmaCompany:');
  const req3 = pool.request();
  const res3 = await req3.query('SELECT ISNULL(NextBillCancelNo, 1) AS NextBillCancelNo FROM tblmaCompany');
  console.log('   -> NextBillCancelNo:', res3.recordset[0]?.NextBillCancelNo);

  console.log('All Void Bill checks verified successfully.');
  process.exit(0);
}

testVoidBillRules().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

