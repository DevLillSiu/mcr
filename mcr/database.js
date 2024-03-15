const { Pool } = require("pg");

const pool = new Pool({
  user: "lillsiu",
  host: "localhost",
  database: "mcr",
  password: "admin",
  port: "5432",
});

pool
  .connect()
  .then(() => console.log("Connected to PostgreSQL"))
  .catch((err) => console.error("Connection error", err));

module.exports = pool;
