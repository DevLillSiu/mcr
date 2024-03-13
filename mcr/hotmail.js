const express = require('express');
const router = express.Router();
const db = require('./database');
const util = require('util');
const query = util.promisify(db.query).bind(db);

router.get('/get', (req,res) => {

    db.query('BEGIN', (err) => {
        if (err) {
            console.error('Transaction error:', err);
            return res.status(500).send('Lỗi kết nối cơ sở dữ liệu');
        }

        db.query(`SELECT id, username, password FROM mcr_hotmail WHERE status = 0 LIMIT 1 FOR UPDATE`, (error, results) => {
            if (error) {
                console.error('Query error:', error);
                return db.query('ROLLBACK', () => {
                    res.status(500).send('Lỗi truy vấn cơ sở dữ liệu');
                });
            }

            if (results.rowCount === 0) {
                return db.query('ROLLBACK', () => {
                    res.status(404).send('Không tìm thấy dữ liệu');
                });
            }

            const data = results.rows[0];
            db.query(`UPDATE mcr_hotmail SET status = 1 WHERE id = $1`, [data.id], (updateError) => {
                if (updateError) {
                    console.error('Update error:', updateError);
                    return db.query('ROLLBACK', () => {
                        res.status(500).send('Lỗi cập nhật cơ sở dữ liệu');
                    });
                }

                db.query('COMMIT', (commitErr) => {
                    if (commitErr) {
                        console.error('Commit error:', commitErr);
                        return db.query('ROLLBACK', () => {
                            res.status(500).send('Lỗi commit giao dịch');
                        });
                    }
                    res.json(data);
                });
            });
        });
    });
});

router.post('/insert', async (req, res) => {
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

const sqlQuery = `INSERT INTO mcr_hotmail (${columnsString}) VALUES (${placeholders})`;

try {
    const result = await query(sqlQuery, values);
    res.send('Data inserted successfully');
} catch (err) {
    console.error(err);
    return res.status(500).send('Error inserting data into database');
}
});

router.put('/update', async (req, res) => {
    const queryParams = req.body;
    
    if (!queryParams.id) {
        return res.status(400).send('ID is required');
    }

    let queryString = 'UPDATE mcr_hotmail SET ';
    const queryParamsArray = [];
    const entries = Object.entries(queryParams);
    let lastKeyAdded = false;
    let paramCount = 1;

    for (let i = 0; i < entries.length; i++) {
        const [key, value] = entries[i];

        if (key === 'id') continue;

        if (typeof value === 'string' && (value.toLowerCase() === 'null' || value === '')) {
            queryString += `${key} = NULL`;
            lastKeyAdded = true;
        } else {
            queryString += `${key} = $${paramCount}`;
            queryParamsArray.push(value);
            lastKeyAdded = true;
            paramCount++;
        }

        if (i < entries.length - 1 && lastKeyAdded) {
            queryString += ', ';
            lastKeyAdded = false;
        }
    }

    if (queryString.endsWith(', ')) {
        queryString = queryString.slice(0, -2);
    }

    queryString += ` WHERE id = $${paramCount}`; 
    queryParamsArray.push(queryParams.id); 

    try {
        const results = await query(queryString, queryParamsArray);
        if (results.rowCount === 0) {
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

router.delete('/delete', async (req, res) => {
    const id = req.body.id;

    if (!id) {
        return res.status(400).send('ID is required');
    }

    const sqlQuery = 'DELETE FROM mcr_hotmail WHERE id = $1';

    try {
        const result = await query(sqlQuery, [id]);
        if (result.rowCount === 0) {
            return res.status(404).send('Record not found');
        }
        res.send('Data deleted successfully');
    } catch (err) {
        console.error(err);
        return res.status(500).send('Error deleting data from database');
    }
});

module.exports = router;