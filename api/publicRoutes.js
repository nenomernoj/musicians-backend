const express = require('express');
const router = express.Router();
const db = require('../db'); // Подключение к базе данных

/**
 * 🔹 API 1: Получить список объявлений музыкантов, ищущих группу
 * Маршрут: GET /public/musicians
 */
router.get('/musicians', (req, res) => {
    let {
        instrument_id,
        genre_id,
        city_id,
        exp,
        page = 1,
        limit = 10
    } = req.query;

    page = Math.max(1, parseInt(page));
    limit = Math.max(1, parseInt(limit));
    const offset = (page - 1) * limit;

    const filters = [];
    const params = [];

    if (instrument_id) {
        filters.push('msa.instrument_id = ?');
        params.push(instrument_id);
    }
    if (genre_id) {
        filters.push('msg.genre_id = ?');
        params.push(genre_id);
    }
    if (city_id) {
        filters.push('msa.city_id = ?');
        params.push(city_id);
    }
    if (exp) {
        filters.push('msa.exp = ?');
        params.push(exp);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    // 🔢 Сначала получаем общее количество
    const countSql = `
    SELECT COUNT(DISTINCT msa.id) AS total
    FROM musician_search_ads msa
    LEFT JOIN musician_search_ad_genres msg ON msa.id = msg.ad_id
    ${whereClause}
  `;

    db.query(countSql, params, (err, countResult) => {
        if (err) {
            console.error('Ошибка при подсчёте музыкантов:', err);
            return res.status(500).json({ message: 'Ошибка сервера' });
        }

        const total = countResult[0].total;

        // 📄 Теперь запрашиваем данные с LIMIT и OFFSET
        const dataSql = `
      SELECT 
        msa.id,
        msa.instrument_id,
        msa.description,
        msa.city_id,
        msa.exp,
        msa.exp_action,
        msa.self_instr,
        msa.user_id,
        u.name AS musician_name,
        COALESCE(MAX(i.thumbnail_path), NULL) AS avatar,
        GROUP_CONCAT(DISTINCT msg.genre_id) AS genres
      FROM musician_search_ads msa
      JOIN users u ON msa.user_id = u.id
      LEFT JOIN images i ON u.id = i.owner_id AND i.owner_type = 'user'
      LEFT JOIN musician_search_ad_genres msg ON msa.id = msg.ad_id
      ${whereClause}
      GROUP BY msa.id
      ORDER BY msa.id DESC
      LIMIT ? OFFSET ?
    `;

        const dataParams = [...params, limit, offset];

        db.query(dataSql, dataParams, (err, results) => {
            if (err) {
                console.error('Ошибка при получении музыкантов:', err);
                return res.status(500).json({ message: 'Ошибка сервера' });
            }

            const musicians = results.map(ad => ({
                ...ad,
                genres: ad.genres ? ad.genres.split(',').map(Number) : [],
                avatar: ad.avatar || null
            }));

            res.json({
                message: 'Список музыкантов получен',
                total,
                musicians
            });
        });
    });
});
router.get('/musicians/:id', (req, res) => {
    const adId = req.params.id;

    const sql = `
    SELECT 
      msa.id AS ad_id,
      msa.description,
      msa.instrument_id,
      msa.city_id,
      msa.exp,
      msa.exp_action,
      msa.self_instr,
      msa.exp_band,
      msa.exp_band_action,
      msa.base,
      msa.self_creation,
      msa.com_project,
      msa.cover_band,
      msa.date,

      u.id AS user_id,
      u.name,
      u.nickname,
      u.city_id AS user_city_id,
      u.vk,
      u.facebook,
      u.instagram,
      u.phone,
      u.email,
      MAX(i.thumbnail_path) AS avatar,

      GROUP_CONCAT(DISTINCT msg.genre_id) AS genre_ids

    FROM musician_search_ads msa
    JOIN users u ON msa.user_id = u.id
    LEFT JOIN images i ON u.id = i.owner_id AND i.owner_type = 'user'
    LEFT JOIN musician_search_ad_genres msg ON msa.id = msg.ad_id
    WHERE msa.id = ?
    GROUP BY msa.id
  `;

    db.query(sql, [adId], (err, results) => {
        if (err) {
            console.error('Ошибка при получении деталей объявления музыканта:', err);
            return res.status(500).json({ message: 'Ошибка сервера' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'Объявление не найдено' });
        }

        const row = results[0];

        const ad = {
            id: row.ad_id,
            description: row.description,
            instrument_id: row.instrument_id,
            city_id: row.city_id,
            exp: row.exp,
            exp_action: row.exp_action,
            self_instr: row.self_instr,
            exp_band: row.exp_band,
            exp_band_action: row.exp_band_action,
            base: row.base,
            self_creation: row.self_creation,
            com_project: row.com_project,
            cover_band: row.cover_band,
            date: row.date,
            genre_ids: row.genre_ids ? row.genre_ids.split(',').map(Number) : [],
        };

        const author = {
            id: row.user_id,
            name: row.name,
            nickname: row.nickname,
            city_id: row.user_city_id,
            phone: row.phone,
            email: row.email,
            vk: row.vk,
            facebook: row.facebook,
            instagram: row.instagram,
            avatar: row.avatar || null
        };


        res.json({
            message: 'Детали объявления успешно получены',
            ad,
            author
        });
    });
});
/**
 * 🔹 API 2: Получить список объявлений групп, ищущих музыкантов
 * Маршрут: GET /public/bands
 */
router.get('/bands', (req, res) => {
    let { instrument_id, genre_id, city_id, exp, page = 1, limit = 10 } = req.query;

    page = Math.max(1, parseInt(page));
    limit = Math.max(1, parseInt(limit));
    const offset = (page - 1) * limit;

    const params = [];
    const filters = [];

    if (instrument_id) {
        filters.push('bsa.instrument_id = ?');
        params.push(instrument_id);
    }
    if (genre_id) {
        filters.push('bg.genre_id = ?');
        params.push(genre_id);
    }
    if (city_id) {
        filters.push('b.city_id = ?');
        params.push(city_id);
    }
    if (exp) {
        filters.push('bsa.exp = ?');
        params.push(exp);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    // 1️⃣ Считаем total
    const countSql = `
    SELECT COUNT(DISTINCT bsa.id) AS total
    FROM band_search_ads bsa
    JOIN bands b ON b.id = bsa.band_id
    LEFT JOIN band_genres bg ON b.id = bg.band_id
    ${whereClause}
  `;

    db.query(countSql, params, (err, countResult) => {
        if (err) {
            console.error('Ошибка при подсчёте объявлений групп:', err);
            return res.status(500).json({ message: 'Ошибка сервера' });
        }

        const total = countResult[0].total;

        // 2️⃣ Загружаем данные
        const dataSql = `
      SELECT bsa.id, bsa.band_id, bsa.instrument_id, bsa.description, bsa.exp, bsa.exp_action, bsa.self_instr,
             b.name AS band_name, b.city_id, MAX(i.thumbnail_path) AS avatar,
             GROUP_CONCAT(DISTINCT bg.genre_id) AS genres
      FROM band_search_ads bsa
               JOIN bands b ON b.id = bsa.band_id
               LEFT JOIN images i ON b.id = i.owner_id AND i.owner_type = 'group'
               LEFT JOIN band_genres bg ON b.id = bg.band_id
      ${whereClause}
      GROUP BY bsa.id
      ORDER BY bsa.id DESC
      LIMIT ? OFFSET ?
    `;

        const dataParams = [...params, limit, offset];

        db.query(dataSql, dataParams, (err, results) => {
            if (err) {
                console.error('Ошибка при получении списка групп:', err);
                return res.status(500).json({ message: 'Ошибка сервера' });
            }

            const bands = results.map(ad => ({
                ...ad,
                genres: ad.genres ? ad.genres.split(',').map(Number) : [],
                avatar: ad.avatar || null
            }));

            res.json({
                message: 'Список объявлений групп получен',
                total,
                bands
            });
        });
    });
});
router.get('/bands/:id', (req, res) => {
    const adId = req.params.id;

    const sql = `
        SELECT
            bsa.id AS ad_id,
            bsa.instrument_id,
            bsa.description,
            bsa.exp,
            bsa.exp_action,
            bsa.self_instr,

            b.id AS band_id,
            b.name AS band_name,
            b.city_id AS band_city_id,
            b.text AS band_description,
            b.band_form_date,

            (SELECT GROUP_CONCAT(bg.genre_id) FROM band_genres bg WHERE bg.band_id = b.id) AS genre_ids,
            (SELECT i.thumbnail_path FROM images i WHERE i.owner_id = b.id AND i.owner_type = 'group' LIMIT 1) AS band_avatar,

      u.id AS user_id,
      u.name AS user_name,
      u.nickname AS user_nickname,
      u.phone,
      u.email,
      u.vk,
      u.instagram,
      u.facebook

        FROM band_search_ads bsa
            JOIN bands b ON b.id = bsa.band_id
            JOIN band_members bm ON bm.band_id = b.id AND bm.role = 'admin'
            JOIN users u ON bm.user_id = u.id
        WHERE bsa.id = ?
            LIMIT 1
    `;

    db.query(sql, [adId], (err, results) => {
        if (err) {
            console.error('Ошибка при получении деталей объявления группы:', err);
            return res.status(500).json({ message: 'Ошибка сервера' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'Объявление не найдено' });
        }

        const row = results[0];

        const ad = {
            id: row.ad_id,
            instrument_id: row.instrument_id,
            description: row.description,
            exp: row.exp,
            exp_action: row.exp_action,
            self_instr: row.self_instr
        };

        const band = {
            id: row.band_id,
            name: row.band_name,
            city_id: row.band_city_id,
            description: row.band_description,
            band_form_date: row.band_form_date,
            genre_ids: row.genre_ids ? row.genre_ids.split(',').map(Number) : [],
            avatar: row.band_avatar || null
        };

        const author = {
            id: row.user_id,
            name: row.user_name,
            nickname: row.user_nickname,
            phone: row.phone,
            email: row.email,
            vk: row.vk,
            instagram: row.instagram,
            facebook: row.facebook
        };

        res.json({
            message: 'Детали объявления группы успешно получены',
            ad,
            band,
            author
        });
    });
});



module.exports = router;