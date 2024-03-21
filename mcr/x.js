const express = require("express");
const router = express.Router();
const db = require("./database");
const util = require("util");
const query = util.promisify(db.query).bind(db);
const async = require("async");

const queueGetCookie = async.queue((task, callback) => {
  db.connect().then((client) => {
    client.query("BEGIN").then(() => {
      client
        .query(
          `SELECT id, cookie FROM mcr_x WHERE cookie IS NOT NULL AND cookie_used = 0 ORDER BY date_reg DESC LIMIT 1 FOR UPDATE`
        )
        .then(({ rows }) => {
          if (rows.length === 0) {
            throw new Error("Không tìm thấy dữ liệu");
          }

          const data = rows[0];
          client
            .query(`UPDATE mcr_x SET cookie_used = 1 WHERE id = $1`, [data.id])
            .then(() => {
              client.query("COMMIT").then(() => {
                callback(null, data);
                client.release();
              });
            });
        })
        .catch((e) => {
          client.query("ROLLBACK").then(() => {
            callback(e);
            client.release();
          });
        });
    });
  });
}, 1);

router.get("/get_cookie", (req, res) => {
  queueGetCookie.push({}, (err, data) => {
    if (err) {
      console.error("Lỗi hàng đợi:", err);
      return res.status(500).send(err.message);
    }
    res.json(data);
  });
});

function queryAsync(client, query, params, callback) {
  client.query(query, params, (error, res) => {
    if (error) {
      callback(error);
    } else {
      callback(null, res);
    }
  });
}

const queueCheckLive = async.queue((task, callback) => {
  db.connect().then((client) => {
    client.query("BEGIN").then(() => {
      const queries = [
        `SELECT id, username FROM mcr_x WHERE status IS NULL AND date_reg BETWEEN CURRENT_DATE - INTERVAL '7 days' AND CURRENT_DATE - INTERVAL '1 day' ORDER BY date_reg DESC  LIMIT 20 FOR UPDATE`,
        `SELECT id, username FROM mcr_x WHERE status IS NULL AND date_cp <= CURRENT_DATE - INTERVAL '1 day' AND date_reg BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE - INTERVAL '8 days' ORDER BY date_reg DESC LIMIT 20 FOR UPDATE`,
        `SELECT id, username FROM mcr_x WHERE status IS NULL AND date_cp <= CURRENT_DATE - INTERVAL '2 days' AND date_reg <= CURRENT_DATE - INTERVAL '14 days' ORDER BY date_reg DESC LIMIT 20 FOR UPDATE`,
      ];

      let results;
      let queryIndex = 0;

      function executeQuery() {
        if (queryIndex >= queries.length) {
          if (!results || results.length === 0) {
            client.query("ROLLBACK").then(() => {
              callback(new Error("Không tìm thấy dữ liệu"));
              client.release();
            });
          } else {
            const updatePromises = results.map(
              (result) =>
                new Promise((resolve, reject) => {
                  queryAsync(
                    client,
                    `UPDATE mcr_x SET status = 'checkinglive' WHERE id = $1`,
                    [result.id],
                    (err, res) => {
                      if (err) {
                        reject(err);
                      } else {
                        resolve(res);
                      }
                    }
                  );
                })
            );

            Promise.all(updatePromises)
              .then(() => {
                client.query("COMMIT").then(() => {
                  callback(null, results);
                  client.release();
                });
              })
              .catch((err) => {
                client.query("ROLLBACK").then(() => {
                  callback(err);
                  client.release();
                });
              });
          }
        } else {
          queryAsync(client, queries[queryIndex++], null, (err, res) => {
            if (err) {
              client.query("ROLLBACK").then(() => {
                callback(err);
                client.release();
              });
            } else if (res.rowCount > 0) {
              results = res.rows;
              executeQuery();
            } else {
              executeQuery();
            }
          });
        }
      }

      executeQuery();
    });
  });
}, 1);

router.get("/check_live", (req, res) => {
  queueCheckLive.push({}, (err, data) => {
    if (err) {
      console.error("Lỗi hàng đợi:", err);
      return res.status(500).send(err.message);
    }
    res.json(data);
  });
});

const queueCheckPoint = async.queue((task, callback) => {
  db.connect().then((client) => {
    client.query("BEGIN").then(() => {
      client
        .query(
          `SELECT id, username, password, twofa, mail FROM mcr_x WHERE status = 'checkpoint' ORDER BY date_reg ASC LIMIT 1 FOR UPDATE`
        )
        .then(({ rows }) => {
          if (rows.length === 0) {
            throw new Error("Không tìm thấy dữ liệu");
          }

          const data = rows[0];
          client
            .query(`UPDATE mcr_x SET status = 'checkingpoint' WHERE id = $1`, [
              data.id,
            ])
            .then(() => {
              client.query("COMMIT").then(() => {
                callback(null, data);
                client.release();
              });
            });
        })
        .catch((e) => {
          client.query("ROLLBACK").then(() => {
            callback(e);
            client.release();
          });
        });
    });
  });
}, 1);

router.get("/check_point", (req, res) => {
  queueCheckPoint.push({}, (err, data) => {
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

  const sqlQuery = `INSERT INTO mcr_x (${columnsString}) VALUES (${placeholders})`;

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

  let queryString = "UPDATE mcr_x SET ";
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

  const sqlQuery = "DELETE FROM mcr_x WHERE id = $1";

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
