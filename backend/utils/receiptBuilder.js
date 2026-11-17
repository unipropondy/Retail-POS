// ==============================================================================
// Project: Supermarket Retail POS
// Module: ESC/POS Thermal Receipt Builder with Multi-Template Support
// File: backend/utils/receiptBuilder.js
// Description: Implements exact VB.NET clsPrint.vb thermal receipt templates:
//              - subPrintRecipt_ups dynamic routing via ReceiptTemplate
//              - subPrintRecipt_Template1: Compact layout (S.No, Desc, Qty, Amount)
//              - subPrintRecipt_Template2: Two-line layout (S.No, Desc / Qty, U/Price, Amount)
//              - subPrintRecipt_Template3: Detailed format with wrap and deposit markers
// ==============================================================================

const configService = require('../config/configService');

/**
 * Low-level ESC/POS buffer builder
 */
class ReceiptBuilder {
  constructor(width = 42) {
    this.width = width;
    this.buffer = [];
    this.init();
  }

  init() {
    this.buffer.push(0x1B, 0x40); // ESC @ (Initialize printer)
    return this;
  }

  alignLeft() {
    this.buffer.push(0x1B, 0x61, 0x00);
    return this;
  }

  alignCenter() {
    this.buffer.push(0x1B, 0x61, 0x01);
    return this;
  }

  alignRight() {
    this.buffer.push(0x1B, 0x61, 0x02);
    return this;
  }

  setBold(enable = true) {
    this.buffer.push(0x1B, 0x45, enable ? 0x01 : 0x00);
    return this;
  }

  setDoubleHeight(enable = true) {
    this.buffer.push(0x1D, 0x21, enable ? 0x01 : 0x00);
    return this;
  }

  lineFeed(n = 1) {
    for (let i = 0; i < n; i++) {
      this.buffer.push(0x0A);
    }
    return this;
  }

  text(str) {
    if (!str) return this;
    const buf = Buffer.from(String(str), 'ascii');
    for (let b of buf) {
      this.buffer.push(b);
    }
    return this;
  }

  textLine(str = '') {
    this.text(str);
    this.lineFeed();
    return this;
  }

  divider(char = '-') {
    return this.textLine(char.repeat(this.width));
  }

  doubleDivider() {
    return this.textLine('='.repeat(this.width));
  }

  row(left, right) {
    const l = String(left || '');
    const r = String(right || '');
    const spaces = Math.max(1, this.width - l.length - r.length);
    this.text(l + ' '.repeat(spaces) + r);
    this.lineFeed();
    return this;
  }

  row3(left, center, right) {
    const l = String(left || '');
    const c = String(center || '');
    const r = String(right || '');
    const leftPad = Math.max(1, Math.floor((this.width - c.length) / 2) - l.length);
    const rightPad = Math.max(1, this.width - l.length - leftPad - c.length - r.length);
    this.text(l + ' '.repeat(leftPad) + c + ' '.repeat(rightPad) + r);
    this.lineFeed();
    return this;
  }

  kickDrawer() {
    // ESC p 0 25 50 (\x1B\x70\x00\x19\x32)
    this.buffer.push(0x1B, 0x70, 0x00, 0x19, 0x32);
    return this;
  }

  cutPaper() {
    this.lineFeed(3);
    this.buffer.push(0x1D, 0x56, 0x41, 0x00); // GS V 65 0 (Full cut)
    return this;
  }

  getBuffer() {
    return Buffer.from(this.buffer);
  }
}

// ------------------------------------------------------------------------------
// Helper: Format Date & Time matching FormatDateTime in clsPrint.vb
// FormatDateTime(InvoiceDate, ShortDate) & "   " & FormatDateTime(CreateDate, ShortTime)
// Prevents raw ISO strings like "2026-11-16T00:00:00.000Z"
// ------------------------------------------------------------------------------
function formatReceiptDateTime(inputDate, createDate) {
  let d = new Date();
  if (inputDate) {
    const parsed = new Date(inputDate);
    if (!isNaN(parsed.getTime())) d = parsed;
  }

  // Date part: DD/MM/YYYY
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const dateFormatted = `${day}/${month}/${year}`;

  // Time part: HH:MM:SS AM/PM (uses createDate if available, else d)
  let t = d;
  if (createDate) {
    const parsedTime = new Date(createDate);
    if (!isNaN(parsedTime.getTime())) t = parsedTime;
  }
  const timeFormatted = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  return { dateFormatted, timeFormatted };
}

// ------------------------------------------------------------------------------
// Helper: Print Company Master Header matching clsPrint.vb
// ------------------------------------------------------------------------------
function printHeader(b, company, { isReprint, isVoid, billNo, dateFormatted, timeFormatted, counter, cashier, salesman }) {
  b.alignCenter();
  b.setBold(true).setDoubleHeight(true);
  b.textLine(company.CompanyName || company.Name || 'RETAIL SUPERMARKET');
  b.setDoubleHeight(false).setBold(false);

  if (company.Address1) b.textLine(company.Address1);
  if (company.Address2) b.textLine(company.Address2);
  const cityZip = [company.Country, company.PostalCode].filter(Boolean).join(' - ');
  if (cityZip) b.textLine(cityZip);

  const phoneFax = [company.TelNo ? `Ph : ${company.TelNo}` : '', company.Fax ? `Fax : ${company.Fax}` : ''].filter(Boolean).join(' ');
  if (phoneFax) b.textLine(phoneFax);

  if (company.GSTRegNo) b.textLine(`GST Registration No : ${company.GSTRegNo}`);

  if (isReprint) {
    b.lineFeed();
    b.setBold(true).textLine('*** DUPLICATE COPY ***').setBold(false);
  }
  if (isVoid) {
    b.lineFeed();
    b.setBold(true).textLine('*** VOID BILL ***').setBold(false);
  }

  b.lineFeed();
  b.doubleDivider();

  b.alignLeft();
  b.row(`Invoice No: ${billNo}`, `Date: ${dateFormatted}`);
  b.row(`Location  : ${counter}`, `Time: ${timeFormatted}`);
  b.row(`Cashier   : ${cashier}`, salesman ? `Sales: ${salesman}` : '');
}

// ------------------------------------------------------------------------------
// Helper: Common Totals & Settlement matching clsPrint.vb
// ------------------------------------------------------------------------------
function printTotalsAndTenders(b, {
  totalItemsCount,
  subTotal,
  discount,
  memberDiscount = 0,
  billDiscount = 0,
  tax,
  roundOff = 0,
  grandTotal,
  payments = [],
  tendered = 0,
  change = 0,
  customerCode = '',
  customerName = '',
  mobile = '',
}) {
  b.divider('-');

  // Total Qty & Total Amount row matching clsPrint.vb
  const totalAmtStr = (subTotal - (discount || 0)).toFixed(2);
  b.row(`Total Qty : ${totalItemsCount}`, `Total Amount : ${totalAmtStr}`);

  if (memberDiscount > 0) {
    b.row('Member Discount $ :', `-${Number(memberDiscount).toFixed(2)}`);
  }
  if (billDiscount > 0) {
    b.row('Bill Discount $   :', `-${Number(billDiscount).toFixed(2)}`);
  }
  if (tax > 0) {
    b.row('[ Gst (Inclusive) 9% :', `${Number(tax).toFixed(2)} ]`);
  }
  if (roundOff !== 0) {
    b.row('Round Off         :', `${Number(roundOff).toFixed(2)}`);
  }

  // Net Amount Bold
  b.setBold(true);
  b.row('Net Amount        :', `$${Number(grandTotal).toFixed(2)}`);
  b.setBold(false);

  b.divider('-');

  // Paymode tender rows
  payments.forEach((p) => {
    const mode = (p.mode || p.payMode || 'CASH').toUpperCase();
    const amt = Number(p.amount !== undefined ? p.amount : grandTotal).toFixed(2);
    b.row(mode, `$${amt}`);
  });

  const hasCash = payments.some(p => (p.mode || p.payMode || '').toUpperCase().includes('CASH'));
  if (hasCash) {
    b.divider('-');
    b.row('Amount Tendered   :', `$${Number(tendered || grandTotal).toFixed(2)}`);
    b.row('Change Due        :', `$${Number(change || 0).toFixed(2)}`);
  }

  // Member / Customer details if present
  if (customerCode && customerCode !== 'CASH') {
    b.divider('-');
    b.row('Customer Code     :', customerCode);
    if (customerName) b.row('Customer Name     :', customerName);
    if (mobile) b.row('Phone No          :', mobile);
  }

  b.divider('-');
  b.alignCenter();
  b.textLine('THANK YOU! PLEASE COME AGAIN');
  b.textLine('GOODS SOLD ARE NON-REFUNDABLE');
  b.lineFeed();
}

// ==============================================================================
// TEMPLATE 1: Compact S.No | Description | Qty | Amount
// Mirroring subPrintRecipt_Template1 from clsPrint.vb
// ==============================================================================
function buildTemplate1Receipt(params) {
  const b = new ReceiptBuilder(42);
  if (params.kickDrawerOnCash) b.kickDrawer();

  printHeader(b, params.company, params);

  b.divider('-');
  // S.No Description           Qty    Amount
  b.textLine('S.No Description          Qty     Amount');
  b.divider('-');

  let totalItemsCount = 0;
  params.items.forEach((item, idx) => {
    const sNo = String(idx + 1).padEnd(4, ' ');
    const desc = (item.description || item.Description || '').substring(0, 18).padEnd(18, ' ');
    const qty = Number(item.qty || item.Qty || 1);
    totalItemsCount += qty;
    const qtyStr = String(qty).padStart(4, ' ');
    const price = Number(item.price || item.Price || 0);
    const itemDisc = Number(item.discount || item.Discount || 0);
    const lineAmt = Number(item.totalValue || item.amount || (qty * price) - itemDisc).toFixed(2).padStart(10, ' ');

    b.textLine(`${sNo} ${desc} ${qtyStr} ${lineAmt}`);

    if (itemDisc > 0) {
      b.textLine(`     (Discount : -${itemDisc.toFixed(2)})`);
    }
  });

  printTotalsAndTenders(b, { ...params, totalItemsCount });
  b.cutPaper();
  return b.getBuffer();
}

// ==============================================================================
// TEMPLATE 2: Two-Line Layout (DEFAULT Singapore Supermarket Standard)
// Mirroring subPrintRecipt_Template2 from clsPrint.vb:
// Line 1: S.No Description
// Line 2:      Qty      U/Price        Amount
// ==============================================================================
function buildTemplate2Receipt(params) {
  const b = new ReceiptBuilder(42);
  if (params.kickDrawerOnCash) b.kickDrawer();

  printHeader(b, params.company, params);

  b.divider('-');
  // Table Header
  b.row('S.No  Description/Qty', 'U/Price     Amount');
  b.divider('-');

  let totalItemsCount = 0;
  params.items.forEach((item, idx) => {
    const sNo = String(idx + 1).padEnd(3, ' ');
    let desc = String(item.description || item.Description || '').trim();
    if (desc.toUpperCase() === 'BCRS DEPOSIT') desc += '*';
    desc = desc.substring(0, 35);

    const qty = Number(item.qty || item.Qty || 1);
    totalItemsCount += qty;

    const unitPrice = Number(item.price || item.Price || 0);
    const itemDisc = Number(item.discount || item.Discount || 0);
    const netAmt = Number(item.totalValue || item.netAmount || (qty * unitPrice) - itemDisc);

    // Line 1: S.No  Description
    b.textLine(`${sNo}   ${desc}`);

    // Line 2:      Qty   U/Price      Amount
    const qtyCol = String(qty).padStart(4, ' ');
    const priceCol = unitPrice.toFixed(2).padStart(8, ' ');
    const amtCol = netAmt.toFixed(2).padStart(9, ' ');
    b.row(`        ${qtyCol} x ${priceCol}`, amtCol);

    if (itemDisc > 0) {
      b.textLine(`        (Discount : -${itemDisc.toFixed(2)})`);
    }
  });

  printTotalsAndTenders(b, { ...params, totalItemsCount });
  b.cutPaper();
  return b.getBuffer();
}

// ==============================================================================
// TEMPLATE 3: Full Description with Detailed Lines & Deposit Tags
// Mirroring subPrintRecipt_Template3 from clsPrint.vb
// ==============================================================================
function buildTemplate3Receipt(params) {
  const b = new ReceiptBuilder(42);
  if (params.kickDrawerOnCash) b.kickDrawer();

  printHeader(b, params.company, params);

  b.divider('-');
  b.textLine('S.No Description          Qty     Amount');
  b.divider('-');

  let totalItemsCount = 0;
  params.items.forEach((item, idx) => {
    const sNo = String(idx + 1).padEnd(3, ' ');
    let desc = String(item.description || item.Description || '').trim();
    if (desc.toUpperCase() === 'BCRS DEPOSIT') desc += '*';

    const qty = Number(item.qty || item.Qty || 1);
    totalItemsCount += qty;

    const unitPrice = Number(item.price || item.Price || 0);
    const itemDisc = Number(item.discount || item.Discount || 0);
    const netAmt = Number(item.totalValue || item.netAmount || (qty * unitPrice) - itemDisc);

    // Full description print (can take 2 lines if needed)
    if (desc.length > 20) {
      b.textLine(`${sNo} ${desc}`);
      const qtyCol = String(qty).padStart(4, ' ');
      const priceCol = unitPrice.toFixed(2).padStart(7, ' ');
      const amtCol = netAmt.toFixed(2).padStart(9, ' ');
      b.row(`      ${qtyCol} x ${priceCol}`, amtCol);
    } else {
      const descPadded = desc.padEnd(20, ' ');
      const qtyPadded = String(qty).padStart(4, ' ');
      const amtPadded = netAmt.toFixed(2).padStart(9, ' ');
      b.textLine(`${sNo} ${descPadded} ${qtyPadded}  ${amtPadded}`);
    }

    if (itemDisc > 0) {
      b.textLine(`     (Discount : -${itemDisc.toFixed(2)})`);
    }
  });

  printTotalsAndTenders(b, { ...params, totalItemsCount });
  b.cutPaper();
  return b.getBuffer();
}

// ==============================================================================
// Main Receipt Generator (subPrintRecipt_ups dispatch)
// Matches clsPrint.vb:
// If UCase(gsReceiptTemplate) = "TEMPLATE1" ...
// ElseIf UCase(gsReceiptTemplate) = "TEMPLATE2" ...
// ElseIf UCase(gsReceiptTemplate) = "TEMPLATE3" ...
// ==============================================================================
function buildSaleReceipt(params) {
  // Determine template dynamically from params or configService
  const configuredTemplate = (
    params.template ||
    configService.get('ReceiptTemplate') ||
    'Template2'
  ).toUpperCase().trim();

  const { dateFormatted, timeFormatted } = formatReceiptDateTime(params.date, params.createDate);

  const enrichedParams = {
    ...params,
    dateFormatted,
    timeFormatted,
  };

  switch (configuredTemplate) {
    case 'TEMPLATE1':
      return buildTemplate1Receipt(enrichedParams);
    case 'TEMPLATE3':
      return buildTemplate3Receipt(enrichedParams);
    case 'TEMPLATE2':
    default:
      return buildTemplate2Receipt(enrichedParams);
  }
}

module.exports = {
  ReceiptBuilder,
  buildSaleReceipt,
  buildTemplate1Receipt,
  buildTemplate2Receipt,
  buildTemplate3Receipt,
};
