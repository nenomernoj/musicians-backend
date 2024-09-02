const express = require('express');
const router = express.Router();
const db = require('../db');


router.get('/citys', (req, res) => {
    const sql = 'SELECT * FROM citys';
    db.query(sql, (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

router.get('/instruments', (req, res) => {
    const sql = 'SELECT * FROM instruments';
    db.query(sql, (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

router.get('/genres', (req, res) => {
    const sql = 'SELECT * FROM genrys';
    db.query(sql, (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

module.exports = router;
