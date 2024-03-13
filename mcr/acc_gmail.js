const express = require("express");
const router = express.Router();
const db = require("./database");
const fs = require("fs");
const Queue = require("promise-queue");

const queue = new Queue(1);

router.get("/get", (req, res) => {
  const quantity = parseInt(req.query.quantity);
  const day = parseInt(req.query.day);
  const live = parseInt(req.query.live);

  queue
    .add(() => {
      return new Promise((resolve, reject) => {
        db.getConnection((err, connection) => {
          if (err) {
            return reject(err);
          }

          connection.beginTransaction((err) => {
            if (err) {
              connection.release();
              return reject(err);
            }

            executeQueries(connection, quantity, day, live)
              .then((result) => {
                connection.commit((err) => {
                  if (err) {
                    connection.rollback(() => {
                      connection.release();
                      reject(err);
                    });
                  } else {
                    connection.release();
                    resolve(result);
                  }
                });
              })
              .catch((err) => {
                connection.rollback(() => {
                  connection.release();
                  reject(err);
                });
              });
          });
        });
      });
    })
    .then((formattedResults) => {
      console.log("Accounts retrieved successfully");
      const currentDate = new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");
      const fileName = `gmail_${currentDate}_${quantity}.txt`;

      if (!Array.isArray(formattedResults)) {
        formattedResults = [];
        res.status(500).json({ error: "Not enough data" });
      } else {
        fs.writeFile(fileName, formattedResults.join("\n"), (err) => {
          if (err) {
            console.error("Error writing file:", err);
            res.status(500).json({ error: "Error writing file" });
          } else {
            console.log("File written successfully");
            res.download(fileName, (err) => {
              if (err) {
                console.error("Error sending file:", err);
                res.status(500).json({ error: "Error sending file" });
              } else {
                console.log("File sent successfully");
                fs.unlink(fileName, (err) => {
                  if (err) {
                    console.error("Error deleting file:", err);
                  } else {
                    console.log("File deleted successfully");
                  }
                });
              }
            });
          }
        });
      }
    })
    .catch((err) => {
      console.error("Error processing request:", err);
      res.status(500).json({ error: "Internal server error" });
    });
});

function executeQueries(connection, quantity, day, live) {
  return new Promise((resolve, reject) => {
    let dateFilter = "";
    let productQuery = "";
    let checklive = "";

    if (day == 1) {
      dateFilter = "AND date_reg = CURRENT_DATE";
    } else if (day == 7) {
      dateFilter =
        "AND date_reg BETWEEN (CURRENT_DATE - INTERVAL '20 days') AND (CURRENT_DATE - INTERVAL '7 days')";
    } else if (day == 20) {
      dateFilter = "AND date_reg < (CURRENT_DATE - INTERVAL '20 days')";
    } else {
      dateFilter = `AND date_reg = (CURRENT_DATE - INTERVAL '${day} days')`;
    }

    if (live == 1) {
      checklive = `status = 'live'`;
    } else {
      checklive = `(status NOT IN ('DaBan', 'AccBanTay') OR status = 'Nuoixong')`;
    }

    productQuery = `SELECT id, username, password, recovery_mail, pc_name FROM mcr_gmail 
           WHERE ${checklive} ${dateFilter} 
           ORDER BY date_reg DESC, pc_name LIMIT $1`;

    connection.query(productQuery, [quantity], (error, results) => {
      if (error) return reject(error);

      if (results.length === 0) {
        return resolve({ error: "Data not found" });
      } else if (results.length < quantity) {
        return resolve({ error: `Not enough data` });
      } else {
        let formattedResults = "";

        formattedResults = results.map(
          (item) =>
            `${item.username}@gmail.com|${item.password}|${item.recovery_mail}`
        );

        const idsToUpdate = results.map((item) => item.id);
        const updateQuery = `UPDATE mcr_gmail SET status = 'AccBanTay', sold_date = CURRENT_TIMESTAMP WHERE id = ANY($1)`;

        connection.query(updateQuery, [idsToUpdate], (updateError) => {
          if (updateError) return reject(updateError);
          const pcNameCounts = {};
          results.forEach((item) => {
            pcNameCounts[item.pc_name] = (pcNameCounts[item.pc_name] || 0) + 1;
          });

          const updatePromises = Object.keys(pcNameCounts).map((pc_name) => {
            const updateQuery2 = `UPDATE thongke_gmail SET quantity_sold = quantity_sold + $1 WHERE name = $2`;
            return new Promise((resolveUpdate, rejectUpdate) => {
              connection.query(
                updateQuery2,
                [pcNameCounts[pc_name], pc_name],
                (updateError) => {
                  if (updateError) rejectUpdate(updateError);
                  else resolveUpdate();
                }
              );
            });
          });
          Promise.all(updatePromises)
            .then(() => {
              resolve(formattedResults);
            })
            .catch(reject);
        });
      }
    });
  });
}

module.exports = router;
