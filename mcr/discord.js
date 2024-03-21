const express = require("express");
const router = express.Router();
const db = require("./database");
const util = require("util");
const query = util.promisify(db.query).bind(db);

router.get("/nuoi_discord", async (req, res) => {
  const pc_name = req.query.pc_name;

  if (!pc_name) {
    return res.status(400).json({ error: 'Thiếu tham số "pc_name"' });
  }

  try {
    await query("BEGIN");

    let results = await query(
      "SELECT id, username, link_save_file FROM mcr_discord WHERE kt = 0 AND date_reg <= (current_timestamp - interval '3 hours') AND pc_name = $1 AND (status <> 'Nuoixong' OR status IS NULL) LIMIT 1 FOR UPDATE",
      [pc_name]
    );

    if (results.rowCount > 0) {
      const data = results.rows[0];
      await query("UPDATE mcr_discord SET kt = 1 WHERE id = $1", [data.id]);
      await query("COMMIT");
      return res.json(data);
    } else {
      results = await query(
        "SELECT id, username, link_save_file FROM mcr_discord WHERE kt = 0 AND pc_name = $1 AND status = 'Nuoixong' AND date_nuoi <= (current_timestamp - interval '24 hours') LIMIT 1 FOR UPDATE",
        [pc_name]
      );
      if (results.rowCount > 0) {
        const data = results.rows[0];
        await query("UPDATE mcr_discord SET kt = 1 WHERE id = $1", [data.id]);
        await query("COMMIT");
        return res.json(data);
      } else {
        await query("ROLLBACK");
        return res
          .status(404)
          .json({ error: "Không tìm thấy dữ liệu phù hợp" });
      }
    }
  } catch (error) {
    await query("ROLLBACK");
    return res
      .status(500)
      .json({ error: "Lỗi truy vấn cơ sở dữ liệu", details: error });
  }
});

router.post("/insert", async (req, res) => {
  const columns = Object.keys(req.query);

  let values = Object.values(req.query);

  if (columns.length === 0) {
    return res.status(400).send("No data provided!");
  }

  values = values.map((value) => {
    if (typeof value === "string") {
      return value === "" || value.toLowerCase() === "null" ? null : value;
    }
    return value;
  });

  const columnsString = columns.map((column) => `"${column}"`).join(", ");

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

  const sqlQuery = `INSERT INTO mcr_discord (${columnsString}) VALUES (${placeholders})`;

  try {
    const result = await query(sqlQuery, values);
    res.send("Data inserted successfully");
  } catch (err) {
    console.error(err);
    return res.status(500).send("Error inserting data into database");
  }
});

router.put("/update", async (req, res) => {
  const queryParams = req.query;

  if (!queryParams.id) {
    return res.status(400).send("ID is required");
  }

  let queryString = "UPDATE mcr_discord SET ";
  const queryParamsArray = [];
  const entries = Object.entries(queryParams);
  let lastKeyAdded = false;
  let paramCount = 1;

  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];

    if (key === "id") continue;

    if (
      typeof value === "string" &&
      (value.toLowerCase() === "null" || value === "")
    ) {
      queryString += `${key} = NULL`;
      lastKeyAdded = true;
    } else {
      queryString += `${key} = $${paramCount}`;
      queryParamsArray.push(value);
      lastKeyAdded = true;
      paramCount++;
    }

    if (i < entries.length - 1 && lastKeyAdded) {
      queryString += ", ";
      lastKeyAdded = false;
    }
  }

  if (queryString.endsWith(", ")) {
    queryString = queryString.slice(0, -2);
  }

  queryString += ` WHERE id = $${paramCount}`;
  queryParamsArray.push(queryParams.id);

  try {
    const results = await query(queryString, queryParamsArray);
    if (results.rowCount === 0) {
      res.status(404).send("Record not found");
    } else {
      console.log("Database updated successfully");
      res.status(200).send("OK");
    }
  } catch (err) {
    console.error("Error updating database:", err);
    res.status(500).send("Internal Server Error");
  }
});

router.delete("/delete", async (req, res) => {
  const id = req.query.id;

  if (!id) {
    return res.status(400).send("ID is required");
  }

  const sqlQuery = "DELETE FROM mcr_discord WHERE id = $1";

  try {
    const result = await query(sqlQuery, [id]);
    if (result.rowCount === 0) {
      return res.status(404).send("Record not found");
    }
    res.send("Data deleted successfully");
  } catch (err) {
    console.error(err);
    return res.status(500).send("Error deleting data from database");
  }
});

module.exports = router;
