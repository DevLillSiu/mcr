const express = require('express');
const router = express.Router();
const db = require('./database');
const Queue = require('promise-queue');

const queue = new Queue(1);

app.get('/api_tw', (req, res) => {
    const day = parseInt(req.query.day);
    const shop = parseInt(req.query.shop);
    const check_2fa = parseInt(req.query.check_2fa);
    const cookie = parseInt(req.query.cookie);
    const order_id = req.query.order_id;
    const quantity = parseInt(req.query.quantity);

    let dateFilter = '';

    if (day == 20) {
        if (check_2fa == 1 && cookie == 1) {
            dateFilter = "AND 2fa IS NOT NULL AND cookie IS NOT NULL AND date_reg < DATE_SUB(CURDATE(), INTERVAL 20 DAY)";
        }else if(check_2fa == 1 && cookie == 0) {
            dateFilter = "AND 2fa IS NOT NULL AND date_reg < DATE_SUB(CURDATE(), INTERVAL 20 DAY)";
        }else if(check_2fa == 0 && cookie == 1) {
            dateFilter = "AND 2fa IS NULL AND cookie IS NOT NULL AND date_reg < DATE_SUB(CURDATE(), INTERVAL 20 DAY)";
        }else {
            dateFilter = "AND date_reg < DATE_SUB(CURDATE(), INTERVAL 20 DAY)";
        }
    }else if (day == 7) {
        if (check_2fa == 1 && cookie == 1) {
            dateFilter = "AND 2fa IS NOT NULL AND cookie IS NOT NULL AND date_reg BETWEEN DATE_SUB(CURDATE(), INTERVAL 20 DAY) AND DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
        }else if(check_2fa == 1 && cookie == 0) {
            dateFilter = "AND 2fa IS NOT NULL AND date_reg BETWEEN DATE_SUB(CURDATE(), INTERVAL 20 DAY) AND DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
        }else if(check_2fa == 0 && cookie == 1) {
            dateFilter = "AND 2fa IS NULL AND cookie IS NOT NULL AND date_reg BETWEEN DATE_SUB(CURDATE(), INTERVAL 20 DAY) AND DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
        }else {
            dateFilter = "AND date_reg BETWEEN DATE_SUB(CURDATE(), INTERVAL 20 DAY) AND DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
        }
    }else if (day == 1) {
        if (check_2fa == 1 && cookie == 1) {
            dateFilter = "AND 2fa IS NOT NULL AND cookie IS NOT NULL AND date_reg = CURRENT_DATE";
        }else if(check_2fa == 1 && cookie == 0) {
            dateFilter = "AND 2fa IS NOT NULL AND date_reg = CURRENT_DATE";
        }else if(check_2fa == 0 && cookie == 1) {
            dateFilter = "AND 2fa IS NULL AND cookie IS NOT NULL AND date_reg = CURRENT_DATE";
        }else {
            dateFilter = "AND date_reg = CURRENT_DATE";
        }
    }else {
        if (check_2fa == 1 && cookie == 1) {
            dateFilter = `AND 2fa IS NOT NULL AND cookie IS NOT NULL AND date_reg = DATE_SUB(CURDATE(), INTERVAL ${day} DAY)`;
        }else if(check_2fa == 1 && cookie == 0) {
            dateFilter = `AND 2fa IS NOT NULL AND date_reg = DATE_SUB(CURDATE(), INTERVAL ${day} DAY)`;
        }else if(check_2fa == 0 && cookie == 1) {
            dateFilter = `AND 2fa IS NULL AND cookie IS NOT NULL AND date_reg = DATE_SUB(CURDATE(), INTERVAL ${day} DAY)`;
        }else {
            dateFilter = `AND date_reg = DATE_SUB(CURDATE(), INTERVAL ${day} DAY)`;
        }
    }

    queue.add(() => {
        return new Promise((resolve, reject) => {
            pool.getConnection((err, connection) => {
                if (err) {
                    return reject(err);
                }

                connection.beginTransaction(err => {
                    if (err) {
                        connection.release();
                        return reject(err);
                    }

                    executeQueries(connection, quantity, dateFilter, order_id, shop, check_2fa, cookie)
                        .then(result => {
                            connection.commit(err => {
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
                        .catch(err => {
                            connection.rollback(() => {
                                connection.release();
                                reject(err);
                            });
                        });
                });
            });
        });
    })
        .then(result => res.json(result))
        .catch(err => {
            console.error('Error processing request:', err);
            res.status(500).json({ error: "Internal server error" });
        });
});

function executeQueries(connection, quantity, dateFilter, order_id, shop, check_2fa, cookie) {
    return new Promise((resolve, reject) => {
        if (!order_id || isNaN(quantity)) {
            const countQuery = `SELECT COUNT(*) AS sum FROM mcr_x WHERE status = 'live' ${dateFilter}`;
            return connection.query(countQuery, (error, results) => {
                if (error) return reject(error);
                resolve({ sum: results[0].sum });
            });
        }

        let checkshop = '';
        let checkshop2 = '';
        let thongke = '';

        if(shop == 1){
            checkshop = `WHEN pc_name = 'Nguyen' THEN 1
                        WHEN pc_name = 'ThanhTu' THEN 2
                        WHEN pc_name = 'CongThanh' THEN 3`;
            checkshop2 = `pc_name NOT IN('TranThiep')`;
            thongke = 'thongke_x_1';
        }else if(shop == 2){
            checkshop = `WHEN pc_name = 'TranThiep' THEN 1
                        WHEN pc_name = 'CongThanh' THEN 2
                        WHEN pc_name = 'Nguyen' THEN 3`;
            checkshop2 = ``;
            thongke = 'thongke_x_2';
        }
            const productQuery = `SELECT id, username, password, 2fa, mail, pc_name FROM mcr_x WHERE status = 'live' AND ${checkshop2} ${dateFilter} ORDER BY 
        CASE 
            ${checkshop}
        END, date_reg DESC,
        pc_name LIMIT ?`;

            connection.query(productQuery, [quantity], (error, results) => {
                if (error) return reject(error);

                if (results.length === 0) {
                    return resolve({ error: "Data not found" });
                } else if (results.length < quantity) {
                    return resolve({ error: `Not enough data` });
                } else {

                    let formattedResults = '';

                    if (check_2fa == 1 && cookie == 1) {
                        formattedResults = results.map(item => (`${item.username}|${item.password}|${item['2fa']}|${item.mail}|${item.cookie}`));
                   }else if(check_2fa == 1 && cookie == 0){
                        formattedResults = results.map(item => (`${item.username}|${item.password}|${item['2fa']}|${item.mail}`));
                   }else if (check_2fa == 0 && cookie == 1) {
                        formattedResults = results.map(item => (`${item.username}|${item.password}|${item.mail}|${item.cookie}`));
                   }

                    const idsToUpdate = results.map(item => item.id);
                    const updateQuery = `UPDATE mcr_x SET status = 'DaBanshop${shop}', sold_date = NOW() WHERE id IN (?)`;

                    connection.query(updateQuery, [idsToUpdate], updateError => {
                        if (updateError) return reject(updateError);
                        const pcNameCounts = {};
                        results.forEach(item => {
                            pcNameCounts[item.pc_name] = (pcNameCounts[item.pc_name] || 0) + 1;
                        });

                        const updatePromises = Object.keys(pcNameCounts).map(pc_name => {
                            const updateQuery2 = `UPDATE ${thongke} SET quantity_sold = quantity_sold + ? WHERE name = ?`;
                            return new Promise((resolveUpdate, rejectUpdate) => {
                                connection.query(updateQuery2, [pcNameCounts[pc_name], pc_name], (updateError) => {
                                    if (updateError) rejectUpdate(updateError);
                                    else resolveUpdate();
                                });
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