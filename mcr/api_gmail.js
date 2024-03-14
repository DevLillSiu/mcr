const express = require("express");
const router = express.Router();
const db = require("./database");
const Queue = require("promise-queue");

const queue = new Queue(1);

router.get("/api", (req, res) => {
  const day = arseInt(req.query.day);
  const order_id = req.query.order_id;
  const quantity = parseInt(req.query.quantity);

  let dateFilter = "";

  if (day == 20) {
    dateFilter = "AND date < (CURRENT_DATE - INTERVAL '20 days')";
  } else if (day == 7) {
    dateFilter =
      "AND date BETWEEN (CURRENT_DATE - INTERVAL '20 days') AND (CURRENT_DATE - INTERVAL '7 days')";
  } else {
    dateFilter = "AND date > (CURRENT_DATE - INTERVAL '7 days')";
  }

  queue
    .add(() => {
      return new Promise((resolve, reject) => {
        pool.getConnection((err, connection) => {
          if (err) {
            return reject(err);
          }

          connection.beginTransaction((err) => {
            if (err) {
              connection.release();
              return reject(err);
            }

            executeQueries(connection, quantity, dateFilter, order_id)
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
    .then((result) => res.json(result))
    .catch((err) => {
      console.error("Error processing request:", err);
      res.status(500).json({ error: "Internal server error" });
    });
});

function executeQueries(connection, quantity, dateFilter, order_id) {
  return new Promise((resolve, reject) => {
    if (!order_id || isNaN(quantity)) {
      const countQuery = `SELECT COUNT(*) AS sum FROM mcr_gmail WHERE status = 'Nuoixong' ${dateFilter}`;
      return connection.query(countQuery, (error, results) => {
        if (error) return reject(error);
        resolve({ sum: results[0].sum });
      });
    }

    const productQuery = `SELECT id, username, password, recovery_mail, pc_name FROM mcr_gmail WHERE status = 'Nuoixong' ${dateFilter} 
        ORDER BY date_reg DESC, pc_name LIMIT $1`;

    connection.query(productQuery, [quantity], (error, results) => {
      if (error) return reject(error);

      if (results.rows.length === 0) {
        return resolve({ error: "Data not found" });
      } else if (results.rows.length < quantity) {
        return resolve({ error: `Not enough data` });
      } else {
        const formattedResults = results.rows.map((item) => ({
          product: `${item.username}@gmail.com|${item.password}|${item.recovery_mail}`,
        }));

        const idsToUpdate = results.rows.map((item) => item.id);
        const updateQuery = `UPDATE mcr_gmail SET status = 'DaBan', kt = 1, sold_date = NOW() WHERE id = ANY($1)`;

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
