// ==============================================================================
// Project: Supermarket Retail POS
// Module: Windows Raw Printer Spooler Helper (Dynamic Hardware Resolution)
// File: backend/utils/rawPrinter.js
// ==============================================================================

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getPool, sql } = require('../config/db');

/**
 * Enumerates all installed Windows printers dynamically via WMI / Win32_Printer
 * @returns {string[]} Array of printer names
 */
function getInstalledPrinters() {
  try {
    const ps = 'Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name';
    const res = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, {
      encoding: 'utf8',
      timeout: 6000,
    });
    return res.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch (e) {
    return [];
  }
}

/**
 * Gets the system default Windows printer
 * @returns {string|null}
 */
function getDefaultPrinter() {
  try {
    const ps = '(Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -ExpandProperty Name)';
    const res = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, {
      encoding: 'utf8',
      timeout: 6000,
    });
    const def = res.trim();
    return def || null;
  } catch (e) {
    return null;
  }
}

/**
 * Sends raw bytes directly to a Windows printer using winspool.Drv StartDocPrinter/WritePrinter
 * @param {string} printerName - Name of the Windows printer
 * @param {Buffer|Array<number>} data - Bytes to send (ESC/POS commands, text, etc.)
 * @returns {boolean} true if write was successful
 */
function sendRawToPrinter(printerName, data) {
  if (!printerName) {
    throw new Error('Printer name is required');
  }

  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const tempId = `pos_print_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const tempBinFile = path.join(os.tmpdir(), `${tempId}.bin`);
  const tempPsFile = path.join(os.tmpdir(), `${tempId}.ps1`);

  fs.writeFileSync(tempBinFile, buffer);

  const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendFileToPrinter(string szPrinterName, string szFileName) {
        IntPtr hPrinter = new IntPtr(0);
        DOCINFOA di = new DOCINFOA();
        bool bSuccess = false;
        di.pDocName = "Retail POS Print Job";
        di.pDataType = "RAW";
        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    byte[] bytes = File.ReadAllBytes(szFileName);
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                    int dwWritten = 0;
                    bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }
}
"@
$success = [RawPrinterHelper]::SendFileToPrinter('${printerName.replace(/'/g, "''")}', '${tempBinFile.replace(/'/g, "''")}')
Write-Output "STATUS:$success"
`;

  fs.writeFileSync(tempPsFile, psScript, 'utf8');

  try {
    const output = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPsFile}"`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    return output.includes('STATUS:True');
  } catch (err) {
    console.error(`❌ [RAW PRINTER ERROR on ${printerName}]:`, err.message);
    throw err;
  } finally {
    try {
      if (fs.existsSync(tempBinFile)) fs.unlinkSync(tempBinFile);
      if (fs.existsSync(tempPsFile)) fs.unlinkSync(tempPsFile);
    } catch (_) {}
  }
}

/**
 * Dynamically resolves the active receipt printer following exact VB.NET parity:
 * Priority:
 * 1. Explicitly provided printerName (e.g. from UI request or App.config)
 * 2. tblmaTerminal.PrinterName matching ComputerName / TerminalCode
 * 3. Windows Default Printer
 * 4. First detected thermal/receipt printer (matching 'receipt', 'pos', 'td80', etc.)
 * 5. First available installed printer
 */
async function getActiveReceiptPrinter(terminalCode, requestedPrinter) {
  const installed = getInstalledPrinters();

  // 1. If explicit printer requested and exists in Windows spooler, use it
  if (requestedPrinter && requestedPrinter.trim()) {
    const reqTrim = requestedPrinter.trim();
    const matched = installed.find(p => p.toUpperCase() === reqTrim.toUpperCase());
    if (matched) return matched;
  }

  // 2. Look up tblmaTerminal for this workstation / terminalCode
  try {
    const pool = await getPool();
    if (pool) {
      const host = os.hostname().trim().toUpperCase();
      const termReq = pool.request();
      termReq.input('host', sql.VarChar(50), host);
      termReq.input('tcode', sql.VarChar(50), String(terminalCode || '').trim().toUpperCase());

      const res = await termReq.query(`
        SELECT TOP 1 RTRIM(LTRIM(PrinterName)) as PrinterName
        FROM tblmaTerminal
        WHERE UPPER(RTRIM(LTRIM(ComputerName))) = @host
           OR (TerminalCode IS NOT NULL AND UPPER(RTRIM(LTRIM(TerminalCode))) = @tcode)
      `);

      if (res.recordset.length > 0 && res.recordset[0].PrinterName) {
        const dbPrinter = res.recordset[0].PrinterName.trim();
        // Check if DB printer name matches an installed printer
        const match = installed.find(p => p.toUpperCase() === dbPrinter.toUpperCase());
        if (match) return match;
      }
    }
  } catch (e) {
    console.warn('⚠️ [GET PRINTER NOTICE]:', e.message);
  }

  // 3. Fallback to Windows Default Printer
  const defaultPrinter = getDefaultPrinter();
  if (defaultPrinter) {
    const match = installed.find(p => p.toUpperCase() === defaultPrinter.toUpperCase());
    if (match) return match;
  }

  // 4. Fallback to any receipt / thermal printer in installed list
  const receiptCandidate = installed.find(p => {
    const u = p.toUpperCase();
    return u.includes('RECEIPT') || u.includes('POS') || u.includes('THERMAL');
  });
  if (receiptCandidate) return receiptCandidate;

  // 5. Ultimate fallback: First installed printer
  return installed[0] || '';
}

/**
 * Triggers the drawer kick pulse via dynamic active receipt printer
 * Pulse bytes: ESC p 0 25 50 (\x1B\x70\x00\x19\x32)
 */
async function kickCashDrawer(terminalCode, customPrinterName) {
  const printer = await getActiveReceiptPrinter(terminalCode, customPrinterName);
  const kickBytes = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0x32]);
  const success = sendRawToPrinter(printer, kickBytes);
  return { success, printer };
}

module.exports = {
  sendRawToPrinter,
  getInstalledPrinters,
  getDefaultPrinter,
  getActiveReceiptPrinter,
  kickCashDrawer,
};
