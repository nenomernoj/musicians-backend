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


// POST
router.post('/band', verifyToken, (req, res) => {
    const {
        name,
        city_id,
        genre_ids,      // Массив жанров
        exp_band,
        exp_band_action,
        base,
        self_creation,
        com_project,
        cover_band,
        text,
        spotify,
        applemus,
        youtube,
        yandexmus,
        band_form_date,
        applicant_phone
    } = req.body;

    const userId = req.user.userId; // Получаем ID пользователя из токена

    // SQL-запрос для добавления группы
    const sqlInsertBand = `
        INSERT INTO bands (name, city_id, exp_band, exp_band_action, base,
                           self_creation, com_project, cover_band, text,
                           spotify, applemus, youtube, yandexmus, band_form_date,
                        applicant_phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sqlInsertBand, [
        name, city_id, exp_band, exp_band_action, base,
        self_creation, com_project, cover_band, text,
        spotify, applemus, youtube, yandexmus, band_form_date, applicant_phone], (err, result) => {
        if (err) {
            console.error('Ошибка при создании группы:', err);
            return res.status(500).json({message: 'Ошибка сервера при создании группы'});
        }

        const bandId = result.insertId; // Получаем ID созданной группы

        // Добавление создателя группы в таблицу band_members с ролью админа
        const sqlInsertMember = `INSERT INTO band_members (band_id, user_id, role)
                                 VALUES (?, ?, 'admin')`;
        db.query(sqlInsertMember, [bandId, userId], (err, result) => {
            if (err) {
                console.error('Ошибка при добавлении пользователя в band_members:', err);
                return res.status(500).json({message: 'Ошибка при добавлении пользователя в band_members'});
            }

            // Если переданы жанры, добавляем их в таблицу связи band_genres
            if (genre_ids && genre_ids.length > 0) {
                const genreValues = genre_ids.map(genre_id => [bandId, genre_id]);

                const sqlInsertGenres = `INSERT INTO band_genres (band_id, genre_id)
                                         VALUES ?`;
                db.query(sqlInsertGenres, [genreValues], (err, result) => {
                    if (err) {
                        console.error('Ошибка при добавлении жанров:', err);
                        return res.status(500).json({message: 'Ошибка при добавлении жанров'});
                    }

                    res.json({
                        message: 'Группа успешно создана',
                        bandId: bandId
                    });
                });
            } else {
                res.json({
                    message: 'Группа успешно создана',
                    bandId: bandId
                });
            }
        });
    });
});
module.exports = router;
