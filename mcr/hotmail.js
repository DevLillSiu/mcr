const express = require("express");
const router = express.Router();
const db = require("./database");
const util = require("util");
const query = util.promisify(db.query).bind(db);
const async = require("async");

const queueGet = async.queue((task, callback) => {
  db.beginTransaction((err) => {
    if (err) {
      console.error("Transaction error:", err);
      callback(new Error("Lỗi kết nối cơ sở dữ liệu"));
      return;
    }

    db.query(
      `SELECT id, username, password FROM mcr_hotmail WHERE status = 0 LIMIT 1 FOR UPDATE`,
      (error, results) => {
        if (error) {
          console.error("Query error:", error);
          db.rollback(() => {
            callback(new Error("Lỗi truy vấn cơ sở dữ liệu"));
          });
          return;
        }

        if (results.rows.length === 0) {
          db.rollback(() => {
            callback(new Error("Không tìm thấy dữ liệu"));
          });
          return;
        }

        const data = results[0];
        db.query(
          `UPDATE mcr_hotmail SET status = 1 WHERE id = $1`,
          data.id,
          (updateError) => {
            if (updateError) {
              console.error("Update error:", updateError);
              db.rollback(() => {
                callback(new Error("Lỗi cập nhật cơ sở dữ liệu"));
              });
              return;
            }

            db.commit((commitErr) => {
              if (commitErr) {
                console.error("Commit error:", commitErr);
                db.rollback(() => {
                  callback(new Error("Lỗi commit giao dịch"));
                });
                return;
              }
              callback(null, data);
            });
          }
        );
      }
    );
  });
}, 1);

router.get("/get", (req, res) => {
  queueGet.push({}, (err, data) => {
    if (err) {
      console.error("Lỗi hàng đợi:", err);
      return res.status(500).send(err.message);
    }
    res.json(data);
  });
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

  const sqlQuery = `INSERT INTO mcr_hotmail (${columnsString}) VALUES (${placeholders})`;

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

  let queryString = "UPDATE mcr_hotmail SET ";
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

  const sqlQuery = "DELETE FROM mcr_hotmail WHERE id = $1";

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
