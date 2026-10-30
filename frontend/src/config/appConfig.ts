// ==============================================================================
// Author: JAVITH, BAVANI 30-10-2026
// Project: Supermarket Retail POS
// Module: Default App Configuration & Helper Utilities
// File: frontend/src/config/appConfig.ts
// Description: Fallback defaults and helper evaluation methods for all 89 settings.
//              Supports both Web and Android APK via cross-platform endpoint resolution.
// ==============================================================================

import { Platform } from "react-native";
import { AppConfig } from "./configTypes";

/**
 * Dynamically resolves the backend base URL across platforms:
 * - Web browser: uses window.location.hostname:5000 or http://localhost:5000
 * - Android Emulator / APK: uses LAN / computer IP or localhost
 */
export function getBackendBaseUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const host = window.location.hostname || "localhost";
    return `http://${host}:5000`;
  }
  // Android APK / React Native default
  return "http://localhost:5000";
}

export const BACKEND_URL = getBackendBaseUrl();

/**
 * Hardcoded fallback matching the exact 89 active VB.NET App.config values
 * Used if server is booting or network is temporarily unreachable
 */
export const DEFAULT_APP_CONFIG: AppConfig = {
  // 1. General Settings
  CompanyName: "ALL INDIA SUPERMART PTE LTD",
  itemListMaxData: 40,
  GridFontSize: 17,
  EnableImageforTouchPad: 1,
  POSWITHSTANDALONE: "N",
  DinamiationDisplay: 1,
  HOLDBILL: 0,
  WebUpdateAllowed: 1,
  WebURL: "http://tog.com.sg/test",
  ManualHold: 0,
  creditsales: 0,
  AgentEnable: 0,
  AbovePrice: 2000,
  Aboveqty: 10,
  ISValueAbove: 0,
  ImagePath: "D:\\UNIPRO\\SMARTERP\\ERP\\NEWPOS\\Debug\\Images\\Display",
  TimerInterval: 5,
  CartonBarcodewithPanel: 1,
  ParticularDayTimePromo: 1,
  AllowHoldOnlyTwobills: 0,
  IncreasePriceByMemberType: 1,
  "ClientSettingsProvider.ServiceUri": "",

  // 2. Database Settings
  Servername: "SCK-TG,5899",
  DBName: "RetailPOSERP",
  UID: "ups",
  PWD: "ups",
  DSNName: "RetailPosERp",
  POSDB: "NEW",
  DBConn: "server=26.63.60.58,5799;uid=ups;pwd=ups;database=RetailposERPKALAISMR",
  DBHQConn: "server=SCK-TG,5899;uid=ups;pwd=ups;database=RetailPOSERP",
  DBConnStandAlone: "server=26.79.167.123\\sql2008;uid=ups;pwd=ups;database=StandAlone",

  // 3. Printer & Receipt Settings
  ReceiptPrinter: "RECEIPT PRINTER",
  ReceiptTemplate: "Template2",
  LoginPrint: 0,
  CrystalReport: 2,
  PrintReceipt: 1,
  PrintDeposit: 1,
  SettlementCopy: 1,
  POSHoldPrint: 1,
  AllowCrystalInSettlement: 1,
  AllowDayendPrint: 1,
  smallfontname: "Courier New",
  smallfontsize: 8,
  smallfontstyle: 0,
  normalFontname: "Courier New",
  normalFontsize: 8,
  normalFontStyle: 1,
  bigFontname: "Courier New",
  bigFontsize: 8,
  bigFontStyle: 1,
  companyNameFontname: "Courier New",
  companyNameFontsize: 9,
  companyNameFontstyle: 1,
  companyAddressFontname: "Courier New",
  companyAddressFontsize: 10,
  companyAddressFontstyle: 0,
  paymode3: 14,
  paymode4: 15,

  // 4. Device Settings
  WeighingScale: 0,
  AIgsWeighingscale: 1,
  DisplayNo: 0,
  COMPort: "COM6",
  MID: "065702089996867",
  TID: "00113593",
  TIDKey: "MDAxMTM1OTM=",
  APIKey: "TmtLoRy70rWnXJQN0PceLqGLhfSb+z5BMbOd5KWOYUk=",

  // 5. NETS Settings
  NETSDESK5000: 1,
  NETSDetailsInReceipt: 1,

  // 6. Payment Settings (mSwipe / PayNow)
  mSwipeURL: "https://gw.mswipelive.sg/",
  mSwipeclientcode: "6500000042",
  PaymentTimeoutSeconds: 60,
  mSwipeAPIKey: "WQaIP4rT4bxj9nnz2PPtSFRy1jLiPOLk",
  mSwipeAppName: "Mswipe",
  mSwipeChannelId: "MswipeTest",
  mSwipeDeviceId: "11281116200024",
  mSwipePNURL: "https://gw.mswipelive.sg/",
  mSwipePNclientcode: "6500000042",
  mSwipePNUserId: "96254222",
  mSwipePNPwd: "254222",

  // 7. YeahPay Settings
  "YeahPay.AppId": "bin38m42efz4ta6f",
  "YeahPay.DeviceSn": "P30224BSJ0633",
  "YeahPay.Secret": "HPIZLZA1SY2NTFHAUQ9HRSRJTWDULPUJ",
  "YeahPay.SyncUrl": "https://business.yeahpay.sg/acceptance/acceptance-mis-pos/sync",
  "YeahPay.AsyncUrl": "https://business.yeahpay.sg/acceptance/acceptance-mis-pos/async",
  "YeahPay.ServerPublicKey": "-----BEGIN PUBLIC KEY-----",
  "YeahPay.ClientPrivateKey": "-----BEGIN PRIVATE KEY-----",

  // 8. Data Sync Settings
  DataSyncURL: "http://26.9.102.130:96/",
  APIEnable: 0,

  // 9. License Settings
  KeySet: "RetailPOS™ Premium - POS"
};

/**
 * Boolean evaluator respecting VB.NET conventions (1, '1', 'Y', true)
 */
export function isEnabled(config: AppConfig | null | undefined, key: keyof AppConfig): boolean {
  if (!config) return false;
  const val = config[key];
  if (typeof val === "boolean") return val;
  if (val === 1 || val === "1" || val === "Y" || val === "y" || val === "true") return true;
  return false;
}

/**
 * Numeric extractor with fallback default
 */
export function getNum(config: AppConfig | null | undefined, key: keyof AppConfig, fallback: number = 0): number {
  if (!config) return fallback;
  const val = Number(config[key]);
  return isNaN(val) ? fallback : val;
}
