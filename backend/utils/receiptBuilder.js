// ==============================================================================
// Project: Supermarket Retail POS
// Module: ESC/POS Thermal Receipt Builder (Exact VB.NET Template1 Layout)
// File: backend/utils/receiptBuilder.js
// ==============================================================================

/**
 * Builds an 80mm ESC/POS byte buffer mirroring subPrintRecipt_Template1 from clsPrint.vb
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
    const buf = Buffer.from(str, 'ascii');
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

/**
 * Generates formatted 80mm ESC/POS receipt bytes matching VB.NET subPrintRecipt_Template1
 */
function buildSaleReceipt({
  company = {},
  billNo = 'INV-00000',
  date = new Date(),
  cashier = 'UPS',
  counter = 'HQPC2',
  salesman = 'HQ',
  items = [],
  subTotal = 0,
  discount = 0,
  tax = 0,
  grandTotal = 0,
  payments = [{ mode: 'CASH', amount: 0 }],
  tendered = 0,
  change = 0,
  isReprint = false,
  isVoid = false,
  kickDrawerOnCash = true,
}) {
  const b = new ReceiptBuilder(42);

  // Cash Drawer Kick if cash tender
  const hasCash = payments.some(p => (p.mode || '').toUpperCase().includes('CASH'));
  if (hasCash && kickDrawerOnCash) {
    b.kickDrawer();
  }

  // Header (Centered)
  b.alignCenter();
  b.setBold(true).setDoubleHeight(true);
  b.textLine(company.CompanyName || company.Name || 'RETAIL SUPERMARKET');
  b.setDoubleHeight(false).setBold(false);

  if (company.Address1) b.textLine(company.Address1);
  if (company.Address2) b.textLine(company.Address2);
  if (company.TelNo) b.textLine(`TEL: ${company.TelNo}`);
  if (company.GSTRegNo) b.textLine(`GST REG NO: ${company.GSTRegNo}`);

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

  // Invoice Metadata (Left Aligned)
  b.alignLeft();
  const dateStr = typeof date === 'string' ? date : date.toLocaleString();
  b.row(`RECEIPT: ${billNo}`, `CTR: ${counter}`);
  b.row(`DATE   : ${dateStr}`, `OPR: ${cashier}`);
  if (salesman) b.textLine(`SALESMAN: ${salesman}`);

  b.divider('-');

  // Item Column Headers
  // Description                      Qty    Total
  b.row('DESCRIPTION', 'QTY x PRICE   TOTAL');
  b.divider('-');

  let totalItemsCount = 0;
  items.forEach((item, idx) => {
    const desc = (item.description || item.Description || `Item ${idx + 1}`).substring(0, 42);
    const qty = Number(item.qty || item.Qty || 1);
    const price = Number(item.price || item.SellingPrice || 0);
    const amount = Number(item.amount || qty * price);
    totalItemsCount += qty;

    b.textLine(desc);
    const detailLeft = `   ${qty} x ${price.toFixed(2)}`;
    const detailRight = amount.toFixed(2);
    b.row(detailLeft, detailRight);
  });

  b.divider('-');

  // Totals Section
  b.row('TOTAL ITEMS:', String(totalItemsCount));
  b.row('SUB TOTAL:', `$${Number(subTotal).toFixed(2)}`);
  if (discount > 0) {
    b.row('DISCOUNT:', `-$${Number(discount).toFixed(2)}`);
  }
  if (tax > 0) {
    b.row('GST (INCLUDED 9%):', `$${Number(tax).toFixed(2)}`);
  }

  b.doubleDivider();
  b.setBold(true).setDoubleHeight(true);
  b.row('TOTAL:', `$${Number(grandTotal).toFixed(2)}`);
  b.setDoubleHeight(false).setBold(false);
  b.doubleDivider();

  // Payment Breakdown
  payments.forEach(p => {
    b.row(`PAYMODE (${p.mode || 'CASH'}):`, `$${Number(p.amount || grandTotal).toFixed(2)}`);
  });

  if (tendered > 0) {
    b.row('TENDERED:', `$${Number(tendered).toFixed(2)}`);
    b.row('CHANGE:', `$${Number(change).toFixed(2)}`);
  }

  b.lineFeed();

  // Footer Message
  b.alignCenter();
  b.textLine('THANK YOU! PLEASE COME AGAIN');
  b.textLine('GOODS SOLD ARE NON-REFUNDABLE');
  b.lineFeed();

  b.cutPaper();
  return b.getBuffer();
}

module.exports = {
  ReceiptBuilder,
  buildSaleReceipt,
};

