// ==============================================================================
// Author: JAVITH, BAVANI 30-10-2026
// Project: Supermarket Retail POS
// Module: App Configuration Master Schema & Defaults
// File: backend/config/appConfig.js
// Description: Centralized definitions and active values for all 89 settings
//              migrated directly from the original VB.NET App.config file.
//              Sensitive secrets are masked before sending to frontend clients.
// ==============================================================================

const path = require('path');
const fs = require('fs');

// Path to runtime persistent configuration overrides (JSON file)
// Zero database tables created or modified, preserving pure backend persistence.
const CONFIG_FILE_PATH = path.join(__dirname, 'appConfig.runtime.json');

// Default initial configuration containing all 89 settings from VB.NET App.config
const DEFAULT_CONFIG = {
  // 1. General Settings (22 settings)
  "CompanyName": "ALL INDIA SUPERMART PTE LTD",
  "itemListMaxData": 40,
  "GridFontSize": 17,
  "EnableImageforTouchPad": 1,
  "POSWITHSTANDALONE": "N",
  "DinamiationDisplay": 1,
  "HOLDBILL": 0,
  "WebUpdateAllowed": 1,
  "WebURL": "http://tog.com.sg/test",
  "ManualHold": 0,
  "creditsales": 0,
  "AgentEnable": 0,
  "AbovePrice": 2000,
  "Aboveqty": 10,
  "ISValueAbove": 0,
  "ImagePath": "D:\\UNIPRO\\SMARTERP\\ERP\\NEWPOS\\Debug\\Images\\Display",
  "TimerInterval": 5,
  "CartonBarcodewithPanel": 1,
  "ParticularDayTimePromo": 1,
  "AllowHoldOnlyTwobills": 0,
  "IncreasePriceByMemberType": 1,
  "ClientSettingsProvider.ServiceUri": "",

  // 2. Database Settings (9 settings)
  "Servername": "SCK-TG,5899",
  "DBName": "RetailPOSERP",
  "UID": "ups",
  "PWD": "ups",
  "DSNName": "RetailPosERp",
  "POSDB": "NEW",
  "DBConn": "server=26.63.60.58,5799;uid=ups;pwd=ups;database=RetailposERPKALAISMR",
  "DBHQConn": "server=SCK-TG,5899;uid=ups;pwd=ups;database=RetailPOSERP",
  "DBConnStandAlone": "server=26.79.167.123\\sql2008;uid=ups;pwd=ups;database=StandAlone",

  // 3. Printer & Receipt Settings (26 settings)
  "ReceiptPrinter": "RECEIPT PRINTER",
  "ReceiptTemplate": "Template2",
  "LoginPrint": 0,
  "CrystalReport": 2,
  "PrintReceipt": 1,
  "PrintDeposit": 1,
  "SettlementCopy": 1,
  "POSHoldPrint": 1,
  "AllowCrystalInSettlement": 1,
  "AllowDayendPrint": 1,
  "smallfontname": "Courier New",
  "smallfontsize": 8,
  "smallfontstyle": 0,
  "normalFontname": "Courier New",
  "normalFontsize": 8,
  "normalFontStyle": 1,
  "bigFontname": "Courier New",
  "bigFontsize": 8,
  "bigFontStyle": 1,
  "companyNameFontname": "Courier New",
  "companyNameFontsize": 9,
  "companyNameFontstyle": 1,
  "companyAddressFontname": "Courier New",
  "companyAddressFontsize": 10,
  "companyAddressFontstyle": 0,
  "paymode3": 14,
  "paymode4": 15,

  // 4. Device Settings (7 settings)
  "WeighingScale": 0,
  "AIgsWeighingscale": 1,
  "DisplayNo": 0,
  "COMPort": "COM6",
  "MID": "065702089996867",
  "TID": "00113593",
  "TIDKey": "MDAxMTM1OTM=",
  "APIKey": "TmtLoRy70rWnXJQN0PceLqGLhfSb+z5BMbOd5KWOYUk=",

  // 5. NETS Settings (2 settings)
  "NETSDESK5000": 1,
  "NETSDetailsInReceipt": 1,

  // 6. Payment Settings (mSwipe / PayNow) (11 settings)
  "mSwipeURL": "https://gw.mswipelive.sg/",
  "mSwipeclientcode": "6500000042",
  "PaymentTimeoutSeconds": 60,
  "mSwipeAPIKey": "WQaIP4rT4bxj9nnz2PPtSFRy1jLiPOLk",
  "mSwipeAppName": "Mswipe",
  "mSwipeChannelId": "MswipeTest",
  "mSwipeDeviceId": "11281116200024",
  "mSwipePNURL": "https://gw.mswipelive.sg/",
  "mSwipePNclientcode": "6500000042",
  "mSwipePNUserId": "96254222",
  "mSwipePNPwd": "254222",

  // 7. YeahPay Settings (7 settings)
  "YeahPay.AppId": "bin38m42efz4ta6f",
  "YeahPay.DeviceSn": "P30224BSJ0633",
  "YeahPay.Secret": "HPIZLZA1SY2NTFHAUQ9HRSRJTWDULPUJ",
  "YeahPay.SyncUrl": "https://business.yeahpay.sg/acceptance/acceptance-mis-pos/sync",
  "YeahPay.AsyncUrl": "https://business.yeahpay.sg/acceptance/acceptance-mis-pos/async",
  "YeahPay.ServerPublicKey": "-----BEGIN PUBLIC KEY-----\n        MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAknPrvKrUs9vy6+Aef0Fz\n        nA/6AlAalatfsdG7PyN54GQgxv2PVLg/NIH99cvGhw6m0T7+GCkURQk+Di2UbBNH\n        VpbKlG7pZ+0YR1SyQcF/9vv8va8200DpMl0wOljuz6i75kDsMCR6RvteBHZOwN0v\n        lDm5Uo6D676QMhgliaTVE6hd3D1CXX1CfajoAYa05bCXkr+Qy01pAVmkKvM540kU\n        0kML5N2pkh9UByCvTEKf/G0J7MvgjQzepYf8+009ljSl1pGBuuJJLU9kExIHIbLi\n        PwhBiqprMb0HLFirVIJgEO0o/b4B5F/9jOZtk6dx1jwlxfidWKeIDFIhhItWM2ef\n        owIDAQAB\n        -----END PUBLIC KEY-----",
  "YeahPay.ClientPrivateKey": "-----BEGIN PRIVATE KEY-----\n        MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC5aUct6m37ok6h\n        jdcSMVAESR15MsGzy+nj674ZGmi5vFcx64ljjfyj4830uUJZSO6OdjA28dFi0lBF\n        FeSNtoC268VYN5NB4V3R09rTAd6CLLuKbe8pG5sTfA9Y98qST9g8UBYgMNje4CEC\n        9144zyyr1IQ3uLGV2Ddm/tR4CXa+iT+gy00c16XwFnWJPuYsrDbEHc4boQg7IkM4\n        kUHsFi5CpZLkj68xKYJ9KDxS3QocSFie69Yhn+3i7k+no9Ss1BYe0esLRUc4ayr6\n        iDkkDMZvOqMiZKnD1Wah+zI47rF7iG2LAmrmV0EaBr/D28JNvX46/X7qEbLysH1b\n        a16RlsBXAgMBAAECggEAHN5Dcua5USCoVYccIX0EFGa97Az3E+N/+zjNVGNEQwcM\n        HH2r2pBU8b+aZawipHwyiIPmZeeozlYooVkTSO1NhS2YgG/Gwc8xKGZv/8Kevm3w\n        lVEgl6nwr0v1p8iNBdLgvCNMDp8MZUdIXInfZcD8F5TzMSnUnJwZpDOxKS9wCaJZ\n        KQ254W1/nVISas7GbTL93+app0RjK2Z8KzxS9xeO/p7ortccqysE54kGQK0ZaE6a\n        rO3+GEx2Gfvk8bfXwHOvcbML1eNf3VHGOFaDAytPm5mCiMVK3XCn8I6weLho1uZo\n        A9nXzkr+dcNXqdmSj5k6xnCwPrf90ZAguX5nsLCyYQKBgQDcAHt8AYJlk7Gi7ysv\n        C3ZrYf7lcpVIacoly2HGSUjJ4nH/f13v6hS6nz+/MMEUpzxtX9dmHGv7aFf23iHB\n        9yA2vxg5O4Khteo+JUGmdZzReULrGYwHg2jVZS406z6nTKTk+5hp4foeLij+zIB6\n        I1ncMNxgiBH3t8gAjJu0PmUd6wKBgQDXv9m6csGBhP6R2iwro9V6oIbV2I/aUPOS\n        frwfU3XVBG5mZLKczKiZPTHm9njVTxzncddykm9/HLUU6H9ToXILMYAnZs+l/n+h\n        0QrhHXg3a/RajINxgxIDtajv3vn17eENRTTtCx4YkOa/7suqrsKB1aiHEM6+53dV\n        ILiN8qUQRQKBgQCkIEf/TzD0jqarIzpYMnj5y3XZvw3Xo/SHFZ+vyeRfmGvrbB2s\n        ajlksIFiJQEmY00VW7baGsIEIOfe6ADPL4n8zbtIlzjxY0GJc0ny4TNIouplcf2h\n        bUu8R2udVxK6xNcPbRNbipaKBW3YCMCgXdcgCeOesGSXJagzoLJYWWQeWQKBgAQP\n        HviMCin2p5d05FnZ1j1dYcwKLAKufTanXcC1IEVmtPEGOfoLO6zOYu72eiWBPIj6\n        MlR8fs6Ear++9A5NvkiJoOCc5ZE47YvM1AiSNl3MkSdW924eSit5snj41/kRhadr\n        QuimyeUqbLz1sC1A5nXs4CPSZCFhV3Rpji9VfleFAoGBALMtXeaU8lYECG+YoEFC\n        4tlufK0mItC8Onoh/D9PHFrkbN9k+p2BxFw04E9EDkPWNxMrl1+oBnLhumaAJC8c\n        BSm83tp76UCTjAid5ybSIcKhbpfnBWhlj69xbLmtBM7L309VDpfXTpdH+VwvKdp/\n        Mgo5r6wk1g3/psKWDtPmVOw5\n        -----END PRIVATE KEY-----",

  // 8. Data Sync Settings (2 settings)
  "DataSyncURL": "http://26.9.102.130:96/",
  "APIEnable": 0,

  // 9. License Settings (1 setting)
  "KeySet": "RetailPOS™ Premium - POS"
};

// Metadata for all 89 settings: Category, DataType, Label, Description, and Security Masking flag
const SETTING_METADATA = {
  // General
  "CompanyName": { category: "General Settings", type: "string", label: "Company Name", desc: "Trading company name on invoices and receipts" },
  "itemListMaxData": { category: "General Settings", type: "number", label: "Item List Max Data", desc: "Maximum rows loaded into touch item and inventory searches" },
  "GridFontSize": { category: "General Settings", type: "number", label: "Grid Font Size", desc: "Base font size for the billing cart table" },
  "EnableImageforTouchPad": { category: "General Settings", type: "boolean", label: "Enable Image for Touch Pad", desc: "Show item images on fast-touch catalog tiles" },
  "POSWITHSTANDALONE": { category: "General Settings", type: "boolean_yn", label: "POS With Standalone", desc: "Enables offline standalone POS failover mode (Y/N)" },
  "DinamiationDisplay": { category: "General Settings", type: "boolean", label: "Dynamic Animation Display", desc: "Enables smooth animations and dynamic customer displays" },
  "HOLDBILL": { category: "General Settings", type: "boolean", label: "Hold Bill Enabled", desc: "Allow cashiers to park/hold the current active transaction" },
  "WebUpdateAllowed": { category: "General Settings", type: "boolean", label: "Web Update Allowed", desc: "Enable remote cloud sync and update checks" },
  "WebURL": { category: "General Settings", type: "string", label: "Web Service URL", desc: "Remote endpoint for web updates and catalog sync" },
  "ManualHold": { category: "General Settings", type: "boolean", label: "Manual Hold Bill", desc: "Enables manual queue hold override" },
  "creditsales": { category: "General Settings", type: "boolean", label: "Credit Sales Allowed", desc: "Allow invoicing on credit ledger accounts" },
  "AgentEnable": { category: "General Settings", type: "boolean", label: "Agent Commission Support", desc: "Enables agent referral and commission calculation" },
  "AbovePrice": { category: "General Settings", type: "number", label: "Above Price Limit", desc: "Threshold price for supervisor authorization alerts" },
  "Aboveqty": { category: "General Settings", type: "number", label: "Above Qty Limit", desc: "Threshold quantity for supervisor authorization alerts" },
  "ISValueAbove": { category: "General Settings", type: "boolean", label: "Enable Value Above Alert", desc: "Enforces threshold alerts on high value/qty items" },
  "ImagePath": { category: "General Settings", type: "string", label: "Catalog Image Path", desc: "Local folder path containing item pictures" },
  "TimerInterval": { category: "General Settings", type: "number", label: "Timer Interval (seconds)", desc: "Auto-refresh and synchronization interval in seconds" },
  "CartonBarcodewithPanel": { category: "General Settings", type: "boolean", label: "Carton Barcode with Panel", desc: "Enables carton/outer barcode unpacking assistance" },
  "ParticularDayTimePromo": { category: "General Settings", type: "boolean", label: "Day & Time Promotion", desc: "Enables happy-hour and day-specific promotional discounts" },
  "AllowHoldOnlyTwobills": { category: "General Settings", type: "boolean", label: "Limit Hold to 2 Bills", desc: "Restricts max concurrent held bills to two" },
  "IncreasePriceByMemberType": { category: "General Settings", type: "boolean", label: "Price by Member Type", desc: "Applies differentiated pricing tiered by member tier" },
  "ClientSettingsProvider.ServiceUri": { category: "General Settings", type: "string", label: "Client Provider Service URI", desc: ".NET Client membership service endpoint" },

  // Database Settings
  "Servername": { category: "Database Settings", type: "string", label: "SQL Server Name", desc: "Primary SQL Server hostname and port" },
  "DBName": { category: "Database Settings", type: "string", label: "Database Name", desc: "Target Microsoft SQL Server database catalog" },
  "UID": { category: "Database Settings", type: "string", label: "Database User ID", desc: "SQL Server authentication login account", isSecret: true },
  "PWD": { category: "Database Settings", type: "string", label: "Database Password", desc: "SQL Server authentication password", isSecret: true },
  "DSNName": { category: "Database Settings", type: "string", label: "DSN Name", desc: "System ODBC Data Source Name" },
  "POSDB": { category: "Database Settings", type: "string", label: "POS Database Mode", desc: "Database schema mode (NEW/LEGACY)" },
  "DBConn": { category: "Database Settings", type: "string", label: "Primary DB Connection", desc: "Connection string to local branch database", isSecret: true },
  "DBHQConn": { category: "Database Settings", type: "string", label: "Headquarters DB Connection", desc: "Connection string to centralized HQ database", isSecret: true },
  "DBConnStandAlone": { category: "Database Settings", type: "string", label: "Standalone Failover DB", desc: "Connection string to emergency standalone SQL Express", isSecret: true },

  // Printer & Receipt Settings
  "ReceiptPrinter": { category: "Printer Settings", type: "string", label: "Receipt Printer Name", desc: "Windows spooler printer name for thermal receipts" },
  "ReceiptTemplate": { category: "Receipt Settings", type: "string", label: "Receipt Layout Template", desc: "Receipt layout style (Template1, Template2, etc.)" },
  "LoginPrint": { category: "Printer Settings", type: "boolean", label: "Print Login Slip", desc: "Print opening register slip on cashier login" },
  "CrystalReport": { category: "Printer Settings", type: "number", label: "Report Engine Version", desc: "Crystal Report rendering engine version" },
  "PrintReceipt": { category: "Receipt Settings", type: "boolean", label: "Auto Print Receipt", desc: "Print customer receipt automatically after payment" },
  "PrintDeposit": { category: "Receipt Settings", type: "boolean", label: "Print Deposit Voucher", desc: "Print deposit collection acknowledgment receipt" },
  "SettlementCopy": { category: "Receipt Settings", type: "number", label: "Settlement Slip Copies", desc: "Number of copies printed for day-end settlement" },
  "POSHoldPrint": { category: "Receipt Settings", type: "boolean", label: "Print Bill Hold Slip", desc: "Print a parked order slip with barcode for held bills" },
  "AllowCrystalInSettlement": { category: "Printer Settings", type: "boolean", label: "Use Crystal for Settlement", desc: "Generate graphic Crystal report for day-end audit" },
  "AllowDayendPrint": { category: "Receipt Settings", type: "boolean", label: "Allow Day-End Print", desc: "Enable printing of Z-Report/Day-End closure summary" },
  "smallfontname": { category: "Receipt Settings", type: "string", label: "Small Font Family", desc: "Font name for small receipt fine-print" },
  "smallfontsize": { category: "Receipt Settings", type: "number", label: "Small Font Size", desc: "Point size for small receipt typography" },
  "smallfontstyle": { category: "Receipt Settings", type: "number", label: "Small Font Style", desc: "0=Normal, 1=Bold" },
  "normalFontname": { category: "Receipt Settings", type: "string", label: "Normal Font Family", desc: "Font name for receipt item rows" },
  "normalFontsize": { category: "Receipt Settings", type: "number", label: "Normal Font Size", desc: "Point size for standard receipt rows" },
  "normalFontStyle": { category: "Receipt Settings", type: "number", label: "Normal Font Style", desc: "0=Normal, 1=Bold" },
  "bigFontname": { category: "Receipt Settings", type: "string", label: "Big Font Family", desc: "Font name for total amount and headers" },
  "bigFontsize": { category: "Receipt Settings", type: "number", label: "Big Font Size", desc: "Point size for receipt total amounts" },
  "bigFontStyle": { category: "Receipt Settings", type: "number", label: "Big Font Style", desc: "0=Normal, 1=Bold" },
  "companyNameFontname": { category: "Receipt Settings", type: "string", label: "Header Store Font", desc: "Font family for store name on receipt header" },
  "companyNameFontsize": { category: "Receipt Settings", type: "number", label: "Header Store Size", desc: "Point size for store header banner" },
  "companyNameFontstyle": { category: "Receipt Settings", type: "number", label: "Header Store Style", desc: "0=Normal, 1=Bold" },
  "companyAddressFontname": { category: "Receipt Settings", type: "string", label: "Address Font Family", desc: "Font family for store address lines" },
  "companyAddressFontsize": { category: "Receipt Settings", type: "number", label: "Address Font Size", desc: "Point size for store address lines" },
  "companyAddressFontstyle": { category: "Receipt Settings", type: "number", label: "Address Font Style", desc: "0=Normal, 1=Bold" },
  "paymode3": { category: "Printer Settings", type: "number", label: "Secondary Paymode Code", desc: "Internal code for auxiliary payment mapping" },
  "paymode4": { category: "Printer Settings", type: "number", label: "Tertiary Paymode Code", desc: "Internal code for auxiliary payment mapping" },

  // Device Settings
  "WeighingScale": { category: "Device Settings", type: "boolean", label: "Weighing Scale Integration", desc: "Read weight automatically via RS-232 serial scale" },
  "AIgsWeighingscale": { category: "Device Settings", type: "boolean", label: "AIGS Scale Protocol", desc: "Enables high-precision AI-GS digital scale protocol" },
  "DisplayNo": { category: "Device Settings", type: "number", label: "VFD Customer Display No", desc: "Serial pole customer display unit index" },
  "COMPort": { category: "Device Settings", type: "string", label: "Hardware COM Port", desc: "Serial communication port for soundbox or pole display" },
  "MID": { category: "Device Settings", type: "string", label: "Payment Merchant ID (MID)", desc: "Soundbox / payment terminal Merchant ID" },
  "TID": { category: "Device Settings", type: "string", label: "Terminal ID (TID)", desc: "Soundbox / payment terminal Terminal ID" },
  "TIDKey": { category: "Device Settings", type: "string", label: "TID Key", desc: "Terminal cryptographic token", isSecret: true },
  "APIKey": { category: "Device Settings", type: "string", label: "Hardware Terminal API Key", desc: "Authentication key for hardware soundbox gateway", isSecret: true },

  // NETS Settings
  "NETSDESK5000": { category: "NETS Settings", type: "boolean", label: "NETS Desk 5000 Terminal", desc: "Integrates Ingenico Desk 5000 / Move 5000 pin-pad" },
  "NETSDetailsInReceipt": { category: "NETS Settings", type: "boolean", label: "NETS Info on Receipt", desc: "Prints approval code and Stan on customer receipt" },

  // Payment Settings (mSwipe & PayNow)
  "mSwipeURL": { category: "Payment Settings", type: "string", label: "mSwipe Gateway URL", desc: "Endpoint for mSwipe card transactions" },
  "mSwipeclientcode": { category: "Payment Settings", type: "string", label: "mSwipe Client Code", desc: "Client account identifier for mSwipe" },
  "PaymentTimeoutSeconds": { category: "Payment Settings", type: "number", label: "Payment Timeout (sec)", desc: "Terminal transaction response timeout in seconds" },
  "mSwipeAPIKey": { category: "Payment Settings", type: "string", label: "mSwipe API Key", desc: "Secret API token for mSwipe card gateway", isSecret: true },
  "mSwipeAppName": { category: "Payment Settings", type: "string", label: "mSwipe App Name", desc: "Application identifier registered with gateway" },
  "mSwipeChannelId": { category: "Payment Settings", type: "string", label: "mSwipe Channel ID", desc: "Channel identifier for transaction routing" },
  "mSwipeDeviceId": { category: "Payment Settings", type: "string", label: "mSwipe Device ID", desc: "Registered POS terminal hardware serial" },
  "mSwipePNURL": { category: "Payment Settings", type: "string", label: "PayNow Gateway URL", desc: "Dynamic PayNow QR generation server endpoint" },
  "mSwipePNclientcode": { category: "Payment Settings", type: "string", label: "PayNow Client Code", desc: "Client merchant code for PayNow QR processing" },
  "mSwipePNUserId": { category: "Payment Settings", type: "string", label: "PayNow User ID", desc: "PayNow merchant account username" },
  "mSwipePNPwd": { category: "Payment Settings", type: "string", label: "PayNow Password", desc: "PayNow gateway merchant password", isSecret: true },

  // YeahPay Settings
  "YeahPay.AppId": { category: "YeahPay Settings", type: "string", label: "YeahPay App ID", desc: "Application ID for Singapore YeahPay digital wallet" },
  "YeahPay.DeviceSn": { category: "YeahPay Settings", type: "string", label: "YeahPay Device Serial", desc: "Certified YeahPay QR display terminal device SN" },
  "YeahPay.Secret": { category: "YeahPay Settings", type: "string", label: "YeahPay API Secret", desc: "HMAC signature secret for YeahPay webhooks", isSecret: true },
  "YeahPay.SyncUrl": { category: "YeahPay Settings", type: "string", label: "YeahPay Sync URL", desc: "Synchronous payment settlement endpoint" },
  "YeahPay.AsyncUrl": { category: "YeahPay Settings", type: "string", label: "YeahPay Async URL", desc: "Asynchronous webhook callback endpoint" },
  "YeahPay.ServerPublicKey": { category: "YeahPay Settings", type: "string", label: "YeahPay Server Public Key", desc: "RSA public key for verifying YeahPay payment receipts" },
  "YeahPay.ClientPrivateKey": { category: "YeahPay Settings", type: "string", label: "YeahPay Private Key", desc: "RSA private key for transaction signing", isSecret: true },

  // Data Sync Settings
  "DataSyncURL": { category: "Data Sync Settings", type: "string", label: "Data Sync Server URL", desc: "Central ERP master data synchronization endpoint" },
  "APIEnable": { category: "Data Sync Settings", type: "boolean", label: "ERP Data Sync Enabled", desc: "Enables background stock and sales sync with central server" },

  // License Settings
  "KeySet": { category: "License Settings", type: "string", label: "POS License KeySet", desc: "Software license identifier and product tier" }
};

module.exports = {
  CONFIG_FILE_PATH,
  DEFAULT_CONFIG,
  SETTING_METADATA
};
