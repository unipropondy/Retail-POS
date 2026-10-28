// ==============================================================================
// 1. IMPORT REQUIRED MODULES
// ==============================================================================

// "dotenv" loads our secret settings (IP, user, password) from the .env file
// into process.env so we don't hardcode sensitive credentials in our code.
require('dotenv').config();

// "mssql" is the official Node.js library used to talk to Microsoft SQL Server.
const sql = require('mssql');

// "crypto" is built directly into Node.js (no npm package needed).
// We use it to generate strong, secure random keys.
const crypto = require('crypto');


// ==============================================================================
// 2. DYNAMIC JWT SECRET GENERATION
// ==============================================================================

// Every time you start Node, this generates a brand new 64-byte random hex string.
// No one can guess this key, and it changes automatically on every server restart.
const JWT_SECRET = crypto.randomBytes(64).toString('hex');

console.log('🔒 JWT Session Security: Initialized');


// ==============================================================================
// 3. DATABASE CONFIGURATION OBJECT
// ==============================================================================

// This object tells the "mssql" library where your SQL Server is and how to log in.
const dbConfig = {
  // Database login username from .env (e.g. "ups")
  user: process.env.DB_USER,

  // Database login password from .env (e.g. "ups")
  password: process.env.DB_PASSWORD,

  // IP address of your SQL Server machine (e.g. "26.63.60.58")
  server: process.env.DB_SERVER,

  // Port number SQL Server is listening on (converted from string to number)
  port: parseInt(process.env.DB_PORT, 10),

  // Database name to use (e.g. "RetailposERPKALAISMR")
  database: process.env.DB_NAME,

  options: {
    // "encrypt: false" is required for local / VPN networks without SSL certificate
    encrypt: false,

    // "trustServerCertificate: true" prevents SSL certificate validation errors
    trustServerCertificate: true,
  },

  // Connection timeout in milliseconds (15 seconds)
  connectionTimeout: 15000,
};


// ==============================================================================
// 4. TEST CONNECTION & QUERY tblMausermaster
// ==============================================================================

async function testDatabaseConnection() {
  console.log(`🔌 Attempting to connect to MS SQL Server at ${dbConfig.server}:${dbConfig.port}...`);
  console.log(`📂 Database: ${dbConfig.database}`);

  let pool;
  try {
    // Connect to SQL Server and open a connection pool
    pool = await sql.connect(dbConfig);
    console.log('✅ Connected to MS SQL Server successfully!\n');

    // Run the query to fetch user master records (Cashiers / Admins)
    console.log('📋 Running query: SELECT * FROM tblMausermaster');
    const result = await pool.request().query('SELECT * FROM tblMausermaster');

    // Display the count and the retrieved rows
    console.log(`\n🎉 Found ${result.recordset.length} users in tblMausermaster:\n`);
    
    // Print formatted table in console
    console.table(
      result.recordset.map((row) => ({
        UserCode: row.UserCode,
        UserName: row.UserName,
        UserGroup: row.UserGroupCode,
        IsAdmin: row.IsAdmin,
        IsCashier: row.IsCashier,
        ExpiryDate: row.ExpiryDate,
      }))
    );

    return result.recordset;
  } catch (error) {
    // If connection or query fails, print detailed error message
    console.error('❌ Database connection / query failed:');
    console.error(error.message);
  } finally {
    // Always close the connection pool when testing is complete
    if (pool) {
      await pool.close();
      console.log('\n🔒 Database connection closed.');
    }
  }
}

// Run the function
testDatabaseConnection();
