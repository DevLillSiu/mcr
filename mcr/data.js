const express = require('express');
const db = require('./database');
const router = express();

const fetchData = () => {
    return new Promise((resolve, reject) => {
        const queries = [
            "SELECT COUNT(*) AS total FROM acc_tw WHERE (status NOT IN ('DaBan', 'DaBanshoptnt', 'AccBanTay', 'AccBanTayshoptnt') OR status = 'live' OR status = 'checkinglive' OR status = 'checkpoint' OR status = 'checkingpoint' OR status IS NULL)",
            "SELECT COUNT(*) AS totalAccRegToday FROM acc_tw WHERE date_reg = CURRENT_DATE",
            "SELECT COUNT(*) AS totalAccLive FROM acc_tw WHERE status = 'live'",
            "SELECT COUNT(*) AS totalAccCheckpoint FROM acc_tw WHERE status = 'checkpoint'",
            "SELECT COUNT(*) AS totalAccCheckingpoint FROM acc_tw WHERE status = 'checkingpoint'",
            "SELECT COUNT(*) AS totalAccCheckinglive FROM acc_tw WHERE status = 'checkinglive'"
        ];

        const data = {};

        const executeQuery = (index) => {
            if (index >= queries.length) {
                db.end();
                resolve(data);
                return;
            }

            db.query(queries[index], (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }
                const key = Object.keys(results.rows[0])[0];
                data[key] = results.rows[0][key];
                executeQuery(index + 1);
            });
        };

        executeQuery(0);
    });
};

router.get('/', async (req, res) => {
    try {
        const data = await fetchData();
        res.json(data);
    } catch (err) {
        res.status(500).send(err.toString());
    }
});

module.exports = router;