const express = require("express");
const router = express.Router();
const db = require("./database");
const Queue = require("promise-queue");

const queue = new Queue(1);

router.get("/api", (req, res) => {
  const day = parseInt(req.query.day);
  const shop = parseInt(req.query.shop);
  const check_2fa = parseInt(req.query.check_2fa);
  const cookie = parseInt(req.query.cookie);
  const order_id = req.query.order_id;
  const quantity = parseInt(req.query.quantity);

  let dateFilter = "";

  if (day == 20) {
    if (check_2fa == 1 && cookie == 1) {
      dateFilter =
        "AND twofa IS NOT NULL AND cookie IS NOT NULL AND date_reg < (CURRENT_DATE - INTERVAL '20 DAY')";
    } else if (check_2fa == 1 && cookie == 0) {
      dateFilter =
        "AND twofa IS NOT NULL AND date_reg < (CURRENT_DATE - INTERVAL '20 DAY')";
    } else if (check_2fa == 0 && cookie == 1) {
      dateFilter =
        "AND twofa IS NULL AND cookie IS NOT NULL AND date_reg < (CURRENT_DATE - INTERVAL '20 DAY')";
    } else {
      dateFilter = "AND date_reg < (CURRENT_DATE - INTERVAL '20 DAY')";
    }
  } else if (day == 7) {
    if (check_2fa == 1 && cookie == 1) {
      dateFilter =
        "AND twofa IS NOT NULL AND cookie IS NOT NULL AND date_reg BETWEEN (CURRENT_DATE - INTERVAL '20 DAY') AND (CURRENT_DATE - INTERVAL '7 DAY')";
    } else if (check_2fa == 1 && cookie == 0) {
      dateFilter =
        "AND twofa IS NOT NULL AND date_reg BETWEEN (CURRENT_DATE - INTERVAL '20 DAY') AND (CURRENT_DATE - INTERVAL '7 DAY')";
    } else if (check_2fa == 0 && cookie == 1) {
      dateFilter =
        "AND twofa IS NULL AND cookie IS NOT NULL AND date_reg BETWEEN (CURRENT_DATE - INTERVAL '20 DAY') AND (CURRENT_DATE - INTERVAL '7 DAY')";
    } else {
      dateFilter =
        "AND date_reg BETWEEN (CURRENT_DATE - INTERVAL '20 DAY') AND (CURRENT_DATE - INTERVAL '7 DAY')";
    }
  } else if (day == 1) {
    if (check_2fa == 1 && cookie == 1) {
      dateFilter =
        "AND twofa IS NOT NULL AND cookie IS NOT NULL AND date_reg = CURRENT_DATE";
    } else if (check_2fa == 1 && cookie == 0) {
      dateFilter = "AND twofa IS NOT NULL AND date_reg = CURRENT_DATE";
    } else if (check_2fa == 0 && cookie == 1) {
      dateFilter =
        "AND twofa IS NULL AND cookie IS NOT NULL AND date_reg = CURRENT_DATE";
    } else {
      dateFilter = "AND date_reg = CURRENT_DATE";
    }
  } else {
    if (check_2fa == 1 && cookie == 1) {
      dateFilter = `AND twofa IS NOT NULL AND cookie IS NOT NULL AND date_reg = (CURRENT_DATE - INTERVAL '${day} DAY')`;
    } else if (check_2fa == 1 && cookie == 0) {
      dateFilter = `AND twofa IS NOT NULL AND date_reg = (CURRENT_DATE - INTERVAL '${day} DAY')`;
    } else if (check_2fa == 0 && cookie == 1) {
      dateFilter = `AND twofa IS NULL AND cookie IS NOT NULL AND date_reg = (CURRENT_DATE - INTERVAL '${day} DAY')`;
    } else {
      dateFilter = `AND date_reg = (CURRENT_DATE - INTERVAL '${day} DAY')`;
    }
  }

  queue
    .add(() => {
      return new Promise((resolve, reject) => {
        db.connect((err, client, done) => {
          if (err) {
            return reject(err);
          }

          client.query("BEGIN", (err) => {
            if (err) {
              done();
              return reject(err);
            }

            executeQueries(
              client,
              quantity,
              dateFilter,
              order_id,
              shop,
              check_2fa,
              cookie
            )
              .then((result) => {
                client.query("COMMIT", (err) => {
                  if (err) {
                    client.query("ROLLBACK", () => {
                      done();
                      reject(err);
                    });
                  } else {
                    done();
                    resolve(result);
                  }
                });
              })
              .catch((err) => {
                client.query("ROLLBACK", () => {
                  done();
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

function executeQueries(
  client,
  quantity,
  dateFilter,
  order_id,
  shop,
  check_2fa,
  cookie
) {
  return new Promise((resolve, reject) => {
    let checkshop = "";
    let checkshop2 = "";
    let thongke = "";

    if (shop == 1) {
      checkshop = `WHEN pc_name = 'Nguyen' THEN 1
                            WHEN pc_name = 'ThanhTu' THEN 2
                            WHEN pc_name = 'CongThanh' THEN 3`;
      checkshop2 = `AND pc_name NOT IN('TranThiep')`;
      thongke = "thongke_x_1";
    } else if (shop == 2) {
      checkshop = `WHEN pc_name = 'TranThiep' THEN 1
                            WHEN pc_name = 'CongThanh' THEN 2
                            WHEN pc_name = 'Nguyen' THEN 3`;
      checkshop2 = "";
      thongke = "thongke_x_2";
    }

    if (!order_id || isNaN(quantity)) {
      const countQuery = `SELECT COUNT(*) AS sum FROM mcr_x WHERE status = 'live' ${checkshop2} ${dateFilter}`;
      return client
        .query(countQuery)
        .then((results) => resolve({ sum: results.rows[0].sum }))
        .catch((error) => reject(error));
    }

    const productQuery = `SELECT id, username, password, twofa, mail, pc_name FROM mcr_x WHERE status = 'live' ${checkshop2} ${dateFilter} ORDER BY 
            CASE 
                ${checkshop}
            END, date_reg DESC,
            pc_name LIMIT $1`;

    client
      .query(productQuery, [quantity])
      .then((results) => {
        if (results.rows.length === 0) {
          return resolve({ error: "Data not found" });
        } else if (results.rows.length < quantity) {
          return resolve({ error: `Not enough data` });
        } else {
          let formattedResults = "";

          if (check_2fa == 1 && cookie == 1) {
            formattedResults = results.rows.map(
              (item) =>
                `${item.username}|${item.password}|${item.twofa}|${item.mail}|${item.cookie}`
            );
          } else if (check_2fa == 1 && cookie == 0) {
            formattedResults = results.rows.map(
              (item) =>
                `${item.username}|${item.password}|${item.twofa}|${item.mail}`
            );
          } else if (check_2fa == 0 && cookie == 1) {
            formattedResults = results.rows.map(
              (item) =>
                `${item.username}|${item.password}|${item.mail}|${item.cookie}`
            );
          }

          const idsToUpdate = results.rows.map((item) => item.id);
          const updateQuery = `UPDATE mcr_x SET status = 'DaBanshop${shop}', sold_date = NOW() WHERE id = ANY($1)`;

          client
            .query(updateQuery, [idsToUpdate])
            .then(() => {
              const pcNameCounts = {};
              results.rows.forEach((item) => {
                pcNameCounts[item.pc_name] =
                  (pcNameCounts[item.pc_name] || 0) + 1;
              });

              const updatePromises = Object.keys(pcNameCounts).map(
                (pc_name) => {
                  const updateQuery2 = `UPDATE ${thongke} SET quantity_sold = quantity_sold + $1 WHERE name = $2`;
                  return client.query(updateQuery2, [
                    pcNameCounts[pc_name],
                    pc_name,
                  ]);
                }
              );
              return Promise.all(updatePromises);
            })
            .then(() => {
              resolve(formattedResults);
            })
            .catch(reject);
        }
      })
      .catch((error) => reject(error));
  });
}

module.exports = router;
