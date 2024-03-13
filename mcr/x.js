const express = require('express');
const router = express.Router();
const db = require('./database');
const util = require('util');
const query = util.promisify(db.query).bind(db);

router.get('/get_cookie', (req,res) => {

    db.beginTransaction(err => {
        if (err) {
            console.error('Transaction error:', err);
            return res.status(500).send('Lỗi kết nối cơ sở dữ liệu');
        }

        db.query(`SELECT id, cookie FROM mcr_x WHERE cookie IS NOT NULL AND cookie_used = 0 LIMIT 1 FOR UPDATE`, (error, results) => {
            if (error) {
                console.error('Query error:', error);
                return db.rollback(() => {
                    res.status(500).send('Lỗi truy vấn cơ sở dữ liệu');
                });
            }

            if (results.length === 0) {
                return db.rollback(() => {
                    res.status(404).send('Không tìm thấy dữ liệu');
                });
            }
            const data = results[0];
            db.query(`UPDATE mcr_x SET cookie_used = 1 WHERE id = ? `, data.id, (updateError) => {
                if (updateError) {
                    console.error('Update error:', updateError);
                    return db.rollback(() => {
                        res.status(500).send('Lỗi cập nhật cơ sở dữ liệu');
                    });
                }

                db.commit(commitErr => {
                    if (commitErr) {
                        console.error('Commit error:', commitErr);
                        return db.rollback(() => {
                            res.status(500).send('Lỗi commit giao dịch');
                        });
                    }
                    res.json(data);
                });
            });
        });
    });
});

router.get('/check_live', (req, res) => {
    db.beginTransaction(err => {
        if (err) {
            console.error('Transaction error:', err);
            return res.status(500).send('Lỗi kết nối cơ sở dữ liệu');
        }

        db.query(`SELECT id, username FROM mcr_x WHERE status IS NULL LIMIT 20 FOR UPDATE`, (error, results) => {
            if (error) {
                console.error('Query error:', error);
                return db.rollback(() => {
                    res.status(500).send('Lỗi truy vấn cơ sở dữ liệu');
                });
            }

            if (results.length === 0) {
                return db.rollback(() => {
                    res.status(404).send('Không tìm thấy dữ liệu');
                });
            }

            const updates = results.map(result => new Promise((resolve, reject) => {
                db.query(`UPDATE mcr_x SET status = 'checkinglive' WHERE id = ?`, [result.id], (updateError) => {
                    if (updateError) {
                        reject(updateError);
                    } else {
                        resolve();
                    }
                });
            }));

            Promise.all(updates)
                .then(() => {
                    db.commit(commitErr => {
                        if (commitErr) {
                            console.error('Commit error:', commitErr);
                            return db.rollback(() => {
                                res.status(500).send('Lỗi commit giao dịch');
                            });
                        }
                        res.json(results); 
                    });
                })
                .catch(updateError => {
                    console.error('Update error:', updateError);
                    db.rollback(() => {
                        res.status(500).send('Lỗi cập nhật cơ sở dữ liệu');
                    });
                });
        });
    });
});


router.get('/check_point', (req,res) => {

    db.beginTransaction(err => {
        if (err) {
            console.error('Transaction error:', err);
            return res.status(500).send('Lỗi kết nối cơ sở dữ liệu');
        }

        db.query(`SELECT id, username, password, 2fa FROM mcr_x WHERE status = 'checkpoint' ORDER BY date_reg ASC LIMIT 1 FOR UPDATE`, (error, results) => {
            if (error) {
                console.error('Query error:', error);
                return db.rollback(() => {
                    res.status(500).send('Lỗi truy vấn cơ sở dữ liệu');
                });
            }

            if (results.length === 0) {
                return db.rollback(() => {
                    res.status(404).send('Không tìm thấy dữ liệu');
                });
            }

            const data = results[0];
            db.query(`UPDATE mcr_x SET status = 'checkingpoint' WHERE id = ?`, data.id, (updateError) => {
                if (updateError) {
                    console.error('Update error:', updateError);
                    return db.rollback(() => {
                        res.status(500).send('Lỗi cập nhật cơ sở dữ liệu');
                    });
                }

                db.commit(commitErr => {
                    if (commitErr) {
                        console.error('Commit error:', commitErr);
                        return db.rollback(() => {
                            res.status(500).send('Lỗi commit giao dịch');
                        });
                    }
                    res.json(data);
                });
            });
        });
    });
});

router.post('/insert_mcr_x', async (req, res) => {
    const columns = Object.keys(req.body);

    let values = Object.values(req.body);

    if (columns.length === 0) {
        return res.status(400).send('No data provided!');
    }

    values = values.map(value => {
        if (typeof value === 'string') {
            return value === '' || value.toLowerCase() === 'null' ? null : value;
        }
        return value;
    });

    const columnsString = columns.map(column => `"${column}"`).join(', ');

const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

const sqlQuery = `INSERT INTO mcr_x (${columnsString}) VALUES (${placeholders})`;

try {
    const result = await query(sqlQuery, values);
    res.send('Data inserted successfully');
} catch (err) {
    console.error(err);
    return res.status(500).send('Error inserting data into database');
}
});

router.put('/update_mcr_x', async (req, res) => {
    const queryParams = req.body;
    
    if (!queryParams.id) {
        return res.status(400).send('ID is required');
    }

    let queryString = 'UPDATE mcr_x SET ';
    const queryParamsArray = [];

    for (const [key, value] of Object.entries(queryParams)) {
        if (key === 'id') continue;

        if (value.toLowerCase() === 'null' || value === '') {
            queryString += `${key} = NULL, `;
        } else {
            queryString += `${key} = ?, `;
            queryParamsArray.push(value);
        }
    }

    queryString = queryString.slice(0, -2); 
    queryString += ' WHERE id = ?'; 
    queryParamsArray.push(queryParams.id); 

    try {
        const results = await query(queryString, queryParamsArray);
        if (results.affectedRows === 0) {
            res.status(404).send('Record not found');
        } else {
            console.log('Database updated successfully');
            res.status(200).send('OK');
        }
    } catch (err) {
        console.error('Error updating database:', err);
        res.status(500).send('Internal Server Error');
    }
});

router.delete('/delete_mcr_x', async (req, res) => {
    const id = req.body.id;

    if (!id) {
        return res.status(400).send('ID is required');
    }

    const sqlQuery = 'DELETE FROM mcr_x WHERE id = ?';

    try {
        const result = await query(sqlQuery, id);
        if (result.affectedRows === 0) {
            return res.status(404).send('Record not found');
        }
        res.send('Data deleted successfully');
    } catch (err) {
        console.error(err);
        return res.status(500).send('Error deleting data from database');
    }
});

module.exports = router;