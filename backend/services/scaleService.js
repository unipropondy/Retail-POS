// ==============================================================================
// Project: Supermarket Retail POS
// Module: Live Serial Weighing Scale Service (frmPos1.vb fncGetWeightfromWeighingScale Parity)
// File: backend/services/scaleService.js
// Description: Communicates with counter scales (Mettler Toledo, CAS, Dibal, Avery Berkel)
//              via RS232 / USB Virtual Serial COM port:
//              - Default Settings: 9600 baud, 8 data bits, 1 stop bit, No parity (9600,N,8,1)
//              - Polling Command: "W\r\n"
//              - Graceful fallback: If scale is offline or not plugged in, returns scaleStatus: 'disconnected'
//              - Zero crash guarantee: Safe COM port discovery and error catching
// ==============================================================================

let SerialPortClass = null;
try {
  SerialPortClass = require('serialport').SerialPort;
} catch (e) {
  // serialport module will be optional or dynamically required
}

class ScaleService {
  constructor() {
    this.port = null;
    this.activeComPort = null;
    this.baudRate = 9600;
    this.lastWeight = 0.0;
    this.isReading = false;
  }

  // List available serial COM ports on the local machine
  async listPorts() {
    try {
      if (SerialPortClass && typeof SerialPortClass.list === 'function') {
        const ports = await SerialPortClass.list();
        return ports.map(p => ({
          path: p.path,
          manufacturer: p.manufacturer || '',
          friendlyName: p.friendlyName || p.path,
        }));
      }
      return [];
    } catch (err) {
      console.warn('⚠️ [SCALE SERVICE] Failed to list COM ports:', err.message);
      return [];
    }
  }

  // Poll live weight from configured COM port
  async readLiveWeight(comPortName = 'COM1', baudRate = 9600) {
    if (!SerialPortClass) {
      return {
        success: false,
        weight: 0.0,
        unit: 'KG',
        message: 'Serial port driver not loaded. Running in software mode.',
        connected: false,
      };
    }

    return new Promise((resolve) => {
      let resolved = false;
      let sp = null;
      let buffer = '';

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { if (sp && sp.isOpen) sp.close(); } catch {}
          resolve({
            success: false,
            weight: 0.0,
            unit: 'KG',
            message: `Scale timeout on ${comPortName}. No response to polling.`,
            connected: false,
          });
        }
      }, 1200);

      try {
        sp = new SerialPortClass({
          path: comPortName,
          baudRate: Number(baudRate) || 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          autoOpen: false,
        });

        sp.open((err) => {
          if (err) {
            clearTimeout(timeout);
            if (!resolved) {
              resolved = true;
              resolve({
                success: false,
                weight: 0.0,
                unit: 'KG',
                message: `Failed to open port ${comPortName}: ${err.message}`,
                connected: false,
              });
            }
            return;
          }

          // Send poll command "W\r\n" matching legacy SendDatatoWeighmachine()
          sp.write('W\r\n', (writeErr) => {
            if (writeErr) {
              clearTimeout(timeout);
              try { sp.close(); } catch {}
              if (!resolved) {
                resolved = true;
                resolve({
                  success: false,
                  weight: 0.0,
                  unit: 'KG',
                  message: `Write error on ${comPortName}: ${writeErr.message}`,
                  connected: false,
                });
              }
            }
          });
        });

        sp.on('data', (data) => {
          buffer += data.toString('utf-8');
          // Parse weight response (format: ST,GS,+  1.250kg or \x02...01.250)
          const match = buffer.match(/([0-9]+\.[0-9]{2,3})/);
          if (match) {
            const parsedWeight = parseFloat(match[1]);
            clearTimeout(timeout);
            try { sp.close(); } catch {}
            if (!resolved) {
              resolved = true;
              this.lastWeight = parsedWeight;
              resolve({
                success: true,
                weight: parsedWeight,
                unit: 'KG',
                message: 'Weight captured successfully',
                connected: true,
              });
            }
          }
        });

        sp.on('error', (err) => {
          clearTimeout(timeout);
          try { sp.close(); } catch {}
          if (!resolved) {
            resolved = true;
            resolve({
              success: false,
              weight: 0.0,
              unit: 'KG',
              message: `Port error: ${err.message}`,
              connected: false,
            });
          }
        });
      } catch (e) {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          resolve({
            success: false,
            weight: 0.0,
            unit: 'KG',
            message: e.message,
            connected: false,
          });
        }
      }
    });
  }
}

module.exports = new ScaleService();

