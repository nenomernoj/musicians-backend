const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const db = require('../db'); // Подключение к базе данных
const bcrypt = require('bcrypt');
// Получение всех объявлений пользователя
router.get('/ads', verifyToken, (req, res) => {
    const userId = req.user.userId; // Получаем ID пользователя из токена

    const sqlGetAds = `
        SELECT msa.id, msa.instrument_id, msa.description, msa.city_id, msa.exp, msa.exp_action, msa.self_instr, msa.exp_band, msa.exp_band_action, msa.base, msa.self_creation, msa.com_project, msa.cover_band, msa.status,
            GROUP_CONCAT(msg.genre_id) AS genres
        FROM musician_search_ads msa
        LEFT JOIN musician_search_ad_genres msg ON msa.id = msg.ad_id
        WHERE msa.user_id = ?
        GROUP BY msa.id
    `;

    db.query(sqlGetAds, [userId], (err, results) => {
        if (err) {
            console.error('Ошибка при получении объявлений пользователя:', err);
            return res.status(500).json({ message: 'Ошибка сервера при получении объявлений' });
        }

        if (results.length === 0) {
            return res.status(200).json({ message: 'У пользователя нет объявлений' });
        }

        // Преобразуем строку с жанрами в массив
        const ads = results.map(ad => ({
            ...ad,
            genres: ad.genres ? ad.genres.split(',').map(Number) : []
        }));

        res.json({
            message: 'Объявления успешно получены',
            ads
        });
    });
});
// Получение конкретного объявления по ID
router.get('/ads/:id', verifyToken, (req, res) => {
    const adId = req.params.id;
    const userId = req.user.userId; // Получаем ID пользователя из токена

    const sqlGetAdById = `
        SELECT msa.id, msa.instrument_id, msa.description, msa.city_id, msa.exp, msa.exp_action, msa.self_instr, msa.exp_band, msa.exp_band_action, msa.base, msa.self_creation, msa.com_project, msa.cover_band,
            GROUP_CONCAT(msg.genre_id) AS genres
        FROM musician_search_ads msa
        LEFT JOIN musician_search_ad_genres msg ON msa.id = msg.ad_id
        WHERE msa.id = ? AND msa.user_id = ?
        GROUP BY msa.id
    `;

    db.query(sqlGetAdById, [adId, userId], (err, results) => {
        if (err) {
            console.error('Ошибка при получении объявления по ID:', err);
            return res.status(500).json({ message: 'Ошибка сервера при получении объявления' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'Объявление не найдено или у вас нет прав на его просмотр' });
        }

        const ad = results[0];
        ad.genres = ad.genres ? ad.genres.split(',').map(Number) : [];

        res.json({
            message: 'Объявление успешно получено',
            ad
        });
    });
});
// Создание объявления
router.post('/ads', verifyToken, (req, res) => {
    const {
        genre_ids,  // Массив жанров
        instrument_id,
        description,
        city_id,
        exp,
        exp_action,
        self_instr,
        exp_band,
        exp_band_action,
        base,
        self_creation,
        com_project,
        cover_band
    } = req.body;

    const userId = req.user.userId; // ID пользователя из токена

    const sqlInsertAd = `
        INSERT INTO musician_search_ads (user_id, instrument_id, description, city_id, exp, exp_action, self_instr, exp_band, exp_band_action, base, self_creation, com_project, cover_band)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sqlInsertAd, [
        userId, instrument_id, description, city_id, exp, exp_action, self_instr, exp_band, exp_band_action, base, self_creation, com_project, cover_band
    ], (err, result) => {
        if (err) {
            console.error('Ошибка при создании объявления:', err);
            return res.status(500).json({ message: 'Ошибка сервера при создании объявления' });
        }

        const adId = result.insertId; // ID созданного объявления

        if (genre_ids && genre_ids.length > 0) {
            const genreValues = genre_ids.map(genre_id => [adId, genre_id]);

            const sqlInsertGenres = `INSERT INTO musician_search_ad_genres (ad_id, genre_id) VALUES ?`;
            db.query(sqlInsertGenres, [genreValues], (err, result) => {
                if (err) {
                    console.error('Ошибка при добавлении жанров:', err);
                    return res.status(500).json({ message: 'Ошибка сервера при добавлении жанров' });
                }

                res.json({
                    message: 'Объявление успешно создано',
                    adId: adId
                });
            });
        } else {
            res.json({
                message: 'Объявление успешно создано',
                adId: adId
            });
        }
    });
});
// Редактирование объявления
router.put('/ads/:id', verifyToken, (req, res) => {
    const adId = req.params.id; // Получаем ID объявления из параметров URL
    const userId = req.user.userId; // Получаем ID пользователя из токена

    const {
        genre_ids,  // Массив жанров
        instrument_id,
        description,
        city_id,
        exp,
        exp_action,
        self_instr,
        exp_band,
        exp_band_action,
        base,
        self_creation,
        com_project,
        cover_band
    } = req.body;

    // Проверяем, что объявление принадлежит текущему пользователю
    const sqlCheckOwnership = `SELECT * FROM musician_search_ads WHERE id = ? AND user_id = ?`;
    db.query(sqlCheckOwnership, [adId, userId], (err, results) => {
        if (err) {
            console.error('Ошибка при проверке прав на редактирование:', err);
            return res.status(500).json({ message: 'Ошибка сервера при проверке прав' });
        }

        if (results.length === 0) {
            return res.status(403).json({ message: 'У вас нет прав на редактирование этого объявления' });
        }

        // Обновляем данные объявления
        const sqlUpdateAd = `
            UPDATE musician_search_ads 
            SET instrument_id = ?, description = ?, city_id = ?, exp = ?, exp_action = ?, self_instr = ?, exp_band = ?, exp_band_action = ?, base = ?, self_creation = ?, com_project = ?, cover_band = ?
            WHERE id = ? AND user_id = ?
        `;

        db.query(sqlUpdateAd, [
            instrument_id, description, city_id, exp, exp_action, self_instr, exp_band, exp_band_action, base, self_creation, com_project, cover_band, adId, userId
        ], (err, result) => {
            if (err) {
                console.error('Ошибка при обновлении объявления:', err);
                return res.status(500).json({ message: 'Ошибка сервера при обновлении объявления' });
            }

            // Удаляем старые жанры для этого объявления
            const sqlDeleteGenres = `DELETE FROM musician_search_ad_genres WHERE ad_id = ?`;
            db.query(sqlDeleteGenres, [adId], (err, result) => {
                if (err) {
                    console.error('Ошибка при удалении старых жанров:', err);
                    return res.status(500).json({ message: 'Ошибка при удалении старых жанров' });
                }

                // Если переданы новые жанры, добавляем их в таблицу
                if (genre_ids && genre_ids.length > 0) {
                    const genreValues = genre_ids.map(genre_id => [adId, genre_id]);

                    const sqlInsertGenres = `INSERT INTO musician_search_ad_genres (ad_id, genre_id) VALUES ?`;
                    db.query(sqlInsertGenres, [genreValues], (err, result) => {
                        if (err) {
                            console.error('Ошибка при добавлении новых жанров:', err);
                            return res.status(500).json({ message: 'Ошибка сервера при добавлении новых жанров' });
                        }

                        res.json({
                            message: 'Объявление успешно обновлено'
                        });
                    });
                } else {
                    res.json({
                        message: 'Объявление успешно обновлено'
                    });
                }
            });
        });
    });
});
// Удаление объявления
router.delete('/ads/:id', verifyToken, (req, res) => {
    const adId = req.params.id; // Получаем ID объявления из параметров URL
    const userId = req.user.userId; // Получаем ID пользователя из токена

    // Проверяем, что объявление принадлежит текущему пользователю
    const sqlCheckOwnership = `SELECT * FROM musician_search_ads WHERE id = ? AND user_id = ?`;
    db.query(sqlCheckOwnership, [adId, userId], (err, results) => {
        if (err) {
            console.error('Ошибка при проверке прав на удаление:', err);
            return res.status(500).json({message: 'Ошибка сервера при проверке прав'});
        }

        if (results.length === 0) {
            return res.status(403).json({message: 'У вас нет прав на удаление этого объявления'});
        }

        // Если объявление принадлежит пользователю, удаляем его
        const sqlDelete = `DELETE FROM musician_search_ads WHERE id = ? AND user_id = ?`;
        db.query(sqlDelete, [adId, userId], (err, result) => {
            if (err) {
                console.error('Ошибка при удалении объявления:', err);
                return res.status(500).json({message: 'Ошибка сервера при удалении объявления'});
            }

            res.json({
                message: 'Объявление успешно удалено'
            });
        });
    });
});
module.exports = router;