const express = require("express");
const router = express.Router();
const db = require("./database");
const util = require("util");
const query = util.promisify(db.query).bind(db);
const async = require("async");

const worker = (task, callback) => {
  const { pc_name, res } = task;

  db.query("BEGIN", (err) => {
    if (err) {
      res.status(500).send("Lỗi kết nối cơ sở dữ liệu");
      return callback(err);
    }

    db.query(
      `SELECT id, username, link_save_file, errorNW  FROM mcr_gmail WHERE kt = 0 AND date <= (NOW() - INTERVAL '3 HOUR') AND pc_name = $1 AND (status <> 'Nuoixong' OR status IS NULL) LIMIT 1 FOR UPDATE`,
      [pc_name],
      (error, results) => {
        if (error) {
          return db.query("ROLLBACK", () => {
            res.status(500).send("Lỗi truy vấn cơ sở dữ liệu");
            callback(error);
          });
        }

        if (results.rows.length > 0) {
          const data = results.rows[0];
          db.query(
            `UPDATE mcr_gmail SET kt = 1 WHERE id = $1`,
            [data.id],
            (updateError) => {
              if (updateError) {
                console.error("Lỗi cập nhật cơ sở dữ liệu:", updateError);
                return db.query("ROLLBACK", () => {
                  res.status(500).send("Lỗi cập nhật cơ sở dữ liệu");
                  callback(updateError);
                });
              }
              db.query("COMMIT", (commitErr) => {
                if (commitErr) {
                  db.query("ROLLBACK", () => {
                    res.status(500).send("Lỗi commit giao dịch");
                    callback(commitErr);
                  });
                  return;
                }
                res.json(data);
                callback();
              });
            }
          );
        } else {
          db.query(
            `SELECT id, username, link_save_file, errorNW FROM mcr_gmail WHERE kt = 0 AND pc_name = $1 AND status = 'Nuoixong' AND date_nuoi <= (NOW() - INTERVAL '24 HOUR') LIMIT 1 FOR UPDATE`,
            [pc_name],
            (error, results) => {
              if (error) {
                return db.query("ROLLBACK", () => {
                  res.status(500).send("Lỗi truy vấn cơ sở dữ liệu");
                  callback(error);
                });
              }

              if (results.rows.length > 0) {
                const data = results.rows[0];
                db.query(
                  `UPDATE mcr_gmail SET kt = 1 WHERE id = $1`,
                  [data.id],
                  (updateError) => {
                    if (updateError) {
                      console.error("Lỗi cập nhật cơ sở dữ liệu:", updateError);
                      return db.query("ROLLBACK", () => {
                        res.status(500).send("Lỗi cập nhật cơ sở dữ liệu");
                        callback(updateError);
                      });
                    }
                    db.query("COMMIT", (commitErr) => {
                      if (commitErr) {
                        db.query("ROLLBACK", () => {
                          res.status(500).send("Lỗi commit giao dịch");
                          callback(commitErr);
                        });
                        return;
                      }
                      res.json(data);
                      callback();
                    });
                  }
                );
              } else {
                db.query("ROLLBACK", () => {
                  res.status(404).send("Không tìm thấy dữ liệu");
                  callback();
                });
              }
            }
          );
        }
      }
    );
  });
};

const queue = async.queue(worker, 1);

router.get("/nuoi_gmail", (req, res) => {
  const pc_name = req.query.pc_name;

  if (pc_name === undefined) {
    res.status(400).send('Thiếu tham số "pc_name"');
  } else {
    queue.push({ pc_name, res }, (err) => {
      if (err) {
        console.error("Lỗi khi thực hiện tác vụ:", err);
      }
    });
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

  const sqlQuery = `INSERT INTO mcr_gmail (${columnsString}) VALUES (${placeholders})`;

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

  let queryString = "UPDATE mcr_gmail SET ";
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

  const sqlQuery = "DELETE FROM mcr_gmail WHERE id = $1";

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
