const express = require("express");
const router = express.Router();
const db = require("./database");
const fs = require("fs");
const Queue = require("promise-queue");

const queue = new Queue(1);

router.get("/get", (req, res) => {
  const quantity = parseInt(req.query.quantity); //1000
  const check2fa = parseInt(req.query.check2fa); //1,0
  const cookie = parseInt(req.query.cookie); //1,0
  const day = parseInt(req.query.day); //1,7,20
  const shop = parseInt(req.query.shop); //1,2
  const live = parseInt(req.query.live); //1,0

  queue
    .add(() => {
      return new Promise(async (resolve, reject) => {
        const client = await db.connect();

        try {
          await client.query("BEGIN");

          const result = await executeQueries(
            client,
            quantity,
            check2fa,
            cookie,
            day,
            shop,
            live
          );

          await client.query("COMMIT");
          resolve(result);
        } catch (err) {
          await client.query("ROLLBACK");
          reject(err);
        } finally {
          client.release();
        }
      });
    })
    .then((formattedResults) => {
      console.log("Accounts retrieved successfully");
      const currentDate = new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");
      const fileName = `twitter_${currentDate}_${quantity}.txt`;

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

function executeQueries(
  connection,
  quantity,
  check2fa,
  cookie,
  day,
  shop,
  live
) {
  return new Promise((resolve, reject) => {
    let dateFilter = "";
    let productQuery = "";
    let check_2fa_cookie = "";
    let check_live = "";
    let checkshop = "";
    let checkshop2 = "";
    let thongke = "";

    if (day == 1) {
      dateFilter = "AND date_reg = CURRENT_DATE";
    } else if (day == 7) {
      dateFilter =
        "AND date_reg BETWEEN CURRENT_DATE - INTERVAL '20 DAY' AND CURRENT_DATE - INTERVAL '7 DAY'";
    } else if (day == 20) {
      dateFilter = "AND date_reg < CURRENT_DATE - INTERVAL '20 DAY'";
    } else {
      dateFilter = `AND date_reg = CURRENT_DATE - INTERVAL '${day} DAY'`;
    }

    if (day == 7 || day == 20) {
      if (check2fa == 1 && cookie == 1) {
        check_2fa_cookie = `"2fa" IS NOT NULL AND cookie IS NOT NULL`;
      } else if (check2fa == 1 && cookie == 0) {
        check_2fa_cookie = `"2fa" IS NOT NULL`;
      } else if (check2fa == 0 && cookie == 1) {
        check_2fa_cookie = `cookie IS NOT NULL AND "2fa" IS NULL`;
      } else {
        check_2fa_cookie = "";
      }
    } else {
      if (check2fa == 1 && cookie == 1) {
        check_2fa_cookie = `"2fa" IS NOT NULL AND cookie IS NOT NULL`;
      } else if (check2fa == 1 && cookie == 0) {
        check_2fa_cookie = `"2fa" IS NOT NULL`;
      } else if (check2fa == 0 && cookie == 1) {
        check_2fa_cookie = `cookie IS NOT NULL AND "2fa" IS NULL`;
      } else {
        check_2fa_cookie = "";
      }
    }

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

    if (live == 1) {
      check_live = `AND status = 'live'`;
    } else {
      check_live = `AND (status NOT IN ('DaBanshop1', 'DaBanshop2', 'AccBanTay1', 'AccBanTay2') OR status = 'live') OR status IS NULL`;
    }

    productQuery = `SELECT id, username, password, "2fa", mail, cookie, pc_name FROM mcr_x 
   WHERE ${check_2fa_cookie} ${check_live} ${checkshop2} ${dateFilter} ORDER BY 
    CASE 
        ${checkshop}
    END, date_reg DESC,
        pc_name LIMIT $1`;

    connection.query(productQuery, [quantity], (error, results) => {
      if (error) return reject(error);

      if (results.rows.length === 0) {
        return resolve({ error: "Data not found" });
      } else if (results.rows.length < quantity) {
        return resolve({ error: `Not enough data` });
      } else {
        let formattedResults = "";

        if (check2fa == 1 && cookie == 1) {
          formattedResults = results.rows.map(
            (item) =>
              `${item.username}|${item.password}|${item["2fa"]}|${item.mail}|${item.cookie}`
          );
        } else if (check2fa == 1 && cookie == 0) {
          formattedResults = results.rows.map(
            (item) =>
              `${item.username}|${item.password}|${item["2fa"]}|${item.mail}`
          );
        } else if (check2fa == 0 && cookie == 1) {
          formattedResults = results.rows.map(
            (item) =>
              `${item.username}|${item.password}|${item.mail}|${item.cookie}`
          );
        }

        const idsToUpdate = results.rows.map((item) => item.id);
        const updateQuery = `UPDATE mcr_x SET status = 'AccBanTay${shop}', sold_date = CURRENT_DATE WHERE id = ANY($1)`;

        connection.query(updateQuery, [idsToUpdate], (updateError) => {
          if (updateError) return reject(updateError);
          const pcNameCounts = {};
          results.rows.forEach((item) => {
            pcNameCounts[item.pc_name] = (pcNameCounts[item.pc_name] || 0) + 1;
          });

          const updatePromises = Object.keys(pcNameCounts).map((pc_name) => {
            const updateQuery2 = `UPDATE ${thongke} SET quantity_sold = quantity_sold + $1 WHERE name = $2`;
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
