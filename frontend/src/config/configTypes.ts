// ==============================================================================
// Author: JAVITH, BAVANI 30-10-2026
// Project: Supermarket Retail POS
// Module: Configuration Types
// File: frontend/src/config/configTypes.ts
// Description: Strongly-typed interface definitions for all 89 active VB.NET
//              App.config settings, categories, and API payloads.
// ==============================================================================

export interface AppConfig {
  // 1. General Settings (22)
  CompanyName: string;
  itemListMaxData: number;
  GridFontSize: number;
  EnableImageforTouchPad: number;
  POSWITHSTANDALONE: string;
  DinamiationDisplay: number;
  HOLDBILL: number;
  WebUpdateAllowed: number;
  WebURL: string;
  ManualHold: number;
  creditsales: number;
  AgentEnable: number;
  AbovePrice: number;
  Aboveqty: number;
  ISValueAbove: number;
  ImagePath: string;
  TimerInterval: number;
  CartonBarcodewithPanel: number;
  ParticularDayTimePromo: number;
  AllowHoldOnlyTwobills: number;
  IncreasePriceByMemberType: number;
  "ClientSettingsProvider.ServiceUri": string;

  // 2. Database Settings (9)
  Servername: string;
  DBName: string;
  UID: string;
  PWD: string;
  DSNName: string;
  POSDB: string;
  DBConn: string;
  DBHQConn: string;
  DBConnStandAlone: string;

  // 3. Printer & Receipt Settings (26)
  ReceiptPrinter: string;
  ReceiptTemplate: string;
  LoginPrint: number;
  CrystalReport: number;
  PrintReceipt: number;
  PrintDeposit: number;
  SettlementCopy: number;
  POSHoldPrint: number;
  AllowCrystalInSettlement: number;
  AllowDayendPrint: number;
  smallfontname: string;
  smallfontsize: number;
  smallfontstyle: number;
  normalFontname: string;
  normalFontsize: number;
  normalFontStyle: number;
  bigFontname: string;
  bigFontsize: number;
  bigFontStyle: number;
  companyNameFontname: string;
  companyNameFontsize: number;
  companyNameFontstyle: number;
  companyAddressFontname: string;
  companyAddressFontsize: number;
  companyAddressFontstyle: number;
  paymode3: number;
  paymode4: number;

  // 4. Device Settings (8)
  WeighingScale: number;
  AIgsWeighingscale: number;
  DisplayNo: number;
  COMPort: string;
  MID: string;
  TID: string;
  TIDKey: string;
  APIKey: string;

  // 5. NETS Settings (2)
  NETSDESK5000: number;
  NETSDetailsInReceipt: number;

  // 6. Payment Settings (mSwipe / PayNow) (11)
  mSwipeURL: string;
  mSwipeclientcode: string;
  PaymentTimeoutSeconds: number;
  mSwipeAPIKey: string;
  mSwipeAppName: string;
  mSwipeChannelId: string;
  mSwipeDeviceId: string;
  mSwipePNURL: string;
  mSwipePNclientcode: string;
  mSwipePNUserId: string;
  mSwipePNPwd: string;

  // 7. YeahPay Settings (7)
  "YeahPay.AppId": string;
  "YeahPay.DeviceSn": string;
  "YeahPay.Secret": string;
  "YeahPay.SyncUrl": string;
  "YeahPay.AsyncUrl": string;
  "YeahPay.ServerPublicKey": string;
  "YeahPay.ClientPrivateKey": string;

  // 8. Data Sync Settings (2)
  DataSyncURL: string;
  APIEnable: number;

  // 9. License Settings (1)
  KeySet: string;
}

export type ConfigCategory =
  | "General Settings"
  | "Database Settings"
  | "Printer Settings"
  | "Receipt Settings"
  | "Payment Settings"
  | "NETS Settings"
  | "YeahPay Settings"
  | "Data Sync Settings"
  | "License Settings"
  | "Device Settings";

export interface ConfigItemMetadata {
  key: keyof AppConfig;
  value: string | number;
  category: ConfigCategory;
  type: "string" | "number" | "boolean" | "boolean_yn";
  label: string;
  desc: string;
  isSecret?: boolean;
}

export interface ConfigApiResponse {
  success: boolean;
  count: number;
  config: AppConfig;
  items: ConfigItemMetadata[];
  timestamp: string;
  message?: string;
}
