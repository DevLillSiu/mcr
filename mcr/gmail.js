const express = require('express');
const router = express.Router();
const db = require('./database');
const util = require('util');
const query = util.promisify(db.query).bind(db);

router.get('/nuoi_gmail', async (req, res) => {
    const pc_name = req.query.pc_name;

    if (!pc_name) {
        return res.status(400).json({ error: 'Thiếu tham số "pc_name"' });
    }

    try {
        await query('START TRANSACTION');

        let results = await query('SELECT id, username, link_save_file FROM mcr_gmail WHERE using = 0 AND date_reg <= DATE_SUB(NOW(), INTERVAL 3 HOUR) AND pc_name = ? AND (status <> "Nuoixong" OR status IS NULL) LIMIT 1 FOR UPDATE', [pc_name]);

        if (results.length > 0) {
            const data = results[0];
            await query('UPDATE mcr_gmail SET using = 1 WHERE id = ?', [data.id]);
            await query('COMMIT');
            return res.json(data);
        } else {
            results = await query('SELECT id, username, link_save_file FROM mcr_gmail WHERE using = 0 AND pc_name = ? AND status = "Nuoixong" AND date_nuoi <= DATE_SUB(NOW(), INTERVAL 24 HOUR) LIMIT 1 FOR UPDATE', [pc_name]);
            if (results.length > 0) {
                const data = results[0];
                await query('UPDATE mcr_gmail SET using = 1 WHERE id = ?', [data.id]);
                await query('COMMIT');
                return res.json(data);
            } else {
                await query('ROLLBACK');
                return res.status(404).json({ error: 'Không tìm thấy dữ liệu phù hợp' });
            }
        }
    } catch (error) {
        await query('ROLLBACK');
        return res.status(500).json({ error: 'Lỗi truy vấn cơ sở dữ liệu', details: error });
    }
});

router.post('/insert_mcr_gmail', async (req, res) => {
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

const sqlQuery = `INSERT INTO mcr_gmail (${columnsString}) VALUES (${placeholders})`;

try {
    const result = await query(sqlQuery, values);
    res.send('Data inserted successfully');
} catch (err) {
    console.error(err);
    return res.status(500).send('Error inserting data into database');
}
});

router.put('/update_mcr_gmail', async (req, res) => {
    const queryParams = req.body;
    
    if (!queryParams.id) {
        return res.status(400).send('ID is required');
    }

    let queryString = 'UPDATE mcr_gmail SET ';
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

router.delete('/delete_mcr_gmail', async (req, res) => {
    const id = req.body.id;

    if (!id) {
        return res.status(400).send('ID is required');
    }

    const sqlQuery = 'DELETE FROM mcr_gmail WHERE id = ?';

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