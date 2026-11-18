require('dotenv').config();
const { getPool, sql } = require('./config/db');

(async () => {
  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    const req = new sql.Request(transaction);
    req.input('InvoiceNo', sql.VarChar(20), 'TESTINV999');
    req.input('InvoiceDate', sql.SmallDateTime, new Date());
    req.input('TotalValue', sql.Decimal(18, 2), 16.10);
    req.input('DetailDiscount', sql.Decimal(18, 2), 0);
    req.input('NetDiscountAmount', sql.Decimal(18, 2), 0);
    req.input('NetDiscountPerc', sql.Decimal(18, 2), 0);
    req.input('MemberDiscount', sql.Decimal(18, 2), 0);
    req.input('TotalDiscount', sql.Decimal(18, 2), 0);
    req.input('DiscountType', sql.VarChar(20), '');
    req.input('Gst', sql.Decimal(18, 2), 0);
    req.input('NetTotal', sql.Decimal(18, 2), 16.10);
    req.input('CashierID', sql.VarChar(10), 'UPS');
    req.input('LocationCode', sql.VarChar(10), 'HQ');
    req.input('TerminalCode', sql.VarChar(10), 'T1');
    req.input('TotalLines', sql.Int, 1);
    req.input('TenderAmount', sql.Decimal(18, 2), 16.10);
    req.input('Balance', sql.Decimal(18, 2), 0);
    req.input('SalesType', sql.VarChar(10), 'CREDIT');
    req.input('CustomerCode', sql.VarChar(10), 'HQ000001');
    req.input('CustomerName', sql.VarChar(50), 'PRIYA');
    req.input('Address1', sql.VarChar(50), '');
    req.input('Address2', sql.VarChar(50), '');
    req.input('Address3', sql.VarChar(50), '');
    req.input('Phone', sql.VarChar(15), '9786310609');
    req.input('Fax', sql.VarChar(15), '');
    req.input('GstType', sql.Char(1), 'Z');
    req.input('RoundOff', sql.Decimal(18, 2), 0);
    req.input('Remarks', sql.NVarChar(400), '');
    req.input('UserID', sql.Char(10), 'UPS');

    console.log('Testing sp_POS_SalesHeader...');
    await req.execute('sp_POS_SalesHeader');
    console.log('sp_POS_SalesHeader succeeded!');

    console.log('Testing sp_POS_PayModeDetail with CREDIT...');
    const payReq = new sql.Request(transaction);
    payReq.input('InvoiceNo', sql.VarChar(10), 'TESTINV999');
    payReq.input('sDate', sql.DateTime, new Date());
    payReq.input('PayMode', sql.VarChar(20), 'CREDIT');
    payReq.input('Amount', sql.Money, 16.10);
    payReq.input('Commision', sql.Money, 0);
    payReq.input('SlipNo', sql.VarChar(10), '');
    payReq.input('UserID', sql.VarChar(10), 'UPS');
    await payReq.execute('sp_POS_PayModeDetail');
    console.log('sp_POS_PayModeDetail succeeded!');

    await transaction.rollback();
    console.log('Transaction safely rolled back!');
  } catch (e) {
    console.error('ERROR OCCURRED:', e);
  } finally {
    process.exit(0);
  }
})();
