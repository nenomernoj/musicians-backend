// api/adminAppealsRoutes.js
const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const db = require('../db');

// Middleware для проверки роли администратора
function verifyAdmin(req, res, next) {
    const userId = req.user.userId;
    const sql = 'SELECT is_admin FROM users WHERE id = ?';

    db.query(sql, [userId], (err, results) => {
        if (err || results.length === 0 || results[0].is_admin !== 1) {
            return res.status(403).json({message: 'Доступ запрещен: только для администраторов'});
        }
        next();
    });
}

// Админский маршрут для создания объявления с телефоном заявителя
router.post('/ads', verifyToken, verifyAdmin, (req, res) => {
    const {
        genre_ids, instrument_id, description, city_id,
        exp, exp_action, self_instr,
        exp_band, exp_band_action, base,
        self_creation, com_project, cover_band,
        applicant_name,
        applicant_phone
    } = req.body;

    const userId = req.user.userId;

    const sql = `
        INSERT INTO musician_search_ads (user_id, instrument_id, description, city_id,
                                         exp, exp_action, self_instr,
                                         exp_band, exp_band_action, base,
                                         self_creation, com_project, cover_band,
                                         applicant_name,
                                         applicant_phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [
        userId, instrument_id, description, city_id,
        exp, exp_action, self_instr,
        exp_band, exp_band_action, base,
        self_creation, com_project, cover_band, applicant_name,
        applicant_phone
    ], (err, result) => {
        if (err) {
            console.error('Ошибка при создании объявления:', err);
            return res.status(500).json({message: 'Ошибка при создании объявления'});
        }

        const adId = result.insertId;

        if (genre_ids && genre_ids.length > 0) {
            const genreValues = genre_ids.map(genre_id => [adId, genre_id]);
            const sqlInsertGenres = `INSERT INTO musician_search_ad_genres (ad_id, genre_id)
                                     VALUES ?`;

            db.query(sqlInsertGenres, [genreValues], (err) => {
                if (err) {
                    console.error('Ошибка при добавлении жанров:', err);
                    return res.status(500).json({message: 'Ошибка при сохранении жанров'});
                }

                return res.json({message: 'Объявление успешно создано администратором', adId});
            });
        } else {
            return res.json({message: 'Объявление успешно создано администратором', adId});
        }
    });
});

module.exports = router;
