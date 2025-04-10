const express = require('express');
const router = express.Router();
const db = require('../db');
const verifyToken = require('../middleware/verifyToken');
const fs = require('fs');
// Создание объявления барахолки
router.post('/', verifyToken, (req, res) => {
    const userId = req.user.userId;
    const {
        title,
        description,
        is_new,
        possible_exchange,
        city_id,
        price,
        cover_image_id,
        image_ids // массив ID из market_ad_images
    } = req.body;

    if (!title || !price || !city_id || !Array.isArray(image_ids) || image_ids.length === 0) {
        return res.status(400).json({message: 'Обязательные поля: title, price, city_id, image_ids'});
    }

    const insertAdSql = `
        INSERT INTO market_ads
        (user_id, title, description, is_new, possible_exchange, city_id, price, publish_date, cover_image_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)
    `;

    const insertAdValues = [
        userId,
        title,
        description,
        !!is_new,
        !!possible_exchange,
        city_id,
        price,
        cover_image_id
    ];

    db.query(insertAdSql, insertAdValues, (err, result) => {
        if (err) {
            console.error('Ошибка при создании объявления:', err);
            return res.status(500).json({message: 'Ошибка при создании объявления'});
        }

        const adId = result.insertId;

        const updateImagesSql = `
            UPDATE market_ad_images
            SET ad_id    = ?,
                is_cover = CASE WHEN id = ? THEN true ELSE false END
            WHERE id IN (?)
        `;

        db.query(updateImagesSql, [adId, cover_image_id, image_ids], (err) => {
            if (err) {
                console.error('Ошибка при обновлении изображений:', err);
                return res.status(500).json({message: 'Ошибка при привязке изображений'});
            }

            res.json({message: 'Объявление создано', adId});
        });
    });
});
// Получить объявление барахолки с изображениями
router.get('/my', verifyToken, (req, res) => {
    const userId = req.user.userId;

    const sql = `
        SELECT m.id,
               m.title,
               m.price,
               m.is_new,
               m.possible_exchange,
               m.city_id,
               m.publish_date,
               img.thumbnail_path AS cover_thumb
        FROM market_ads m
                 LEFT JOIN market_ad_images img ON img.ad_id = m.id AND img.is_cover = true
        WHERE m.user_id = ?
        ORDER BY m.publish_date DESC
    `;

    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Ошибка при получении объявлений:', err);
            return res.status(500).json({message: 'Ошибка сервера'});
        }

        res.json({ads: results});
    });
});
router.get('/:id', (req, res) => {
    const adId = req.params.id;

    const adSql = `
        SELECT ma.id,
               ma.user_id,
               ma.title,
               ma.description,
               ma.is_new,
               ma.city_id,
               ma.price,
               ma.publish_date,
               u.name AS author_name,
               u.nickname,
               u.phone,
               u.email
        FROM market_ads ma
                 JOIN users u ON u.id = ma.user_id
        WHERE ma.id = ?
    `;

    db.query(adSql, [adId], (err, adResults) => {
        if (err || adResults.length === 0) {
            return res.status(404).json({message: 'Объявление не найдено'});
        }

        const ad = adResults[0];

        const imgSql = `
            SELECT id, file_path, thumbnail_path, is_cover
            FROM market_ad_images
            WHERE ad_id = ?
            ORDER BY is_cover DESC, id ASC
        `;

        db.query(imgSql, [adId], (err, images) => {
            if (err) {
                return res.status(500).json({message: 'Ошибка при получении изображений'});
            }

            res.json({
                message: 'Детали объявления получены',
                ad: {
                    id: ad.id,
                    title: ad.title,
                    description: ad.description,
                    is_new: !!ad.is_new,
                    city_id: ad.city_id,
                    price: ad.price,
                    publish_date: ad.publish_date,
                    author: {
                        id: ad.user_id,
                        name: ad.author_name,
                        nickname: ad.nickname,
                        phone: ad.phone,
                        email: ad.email
                    },
                    images: images.map(img => ({
                        id: img.id,
                        original: img.file_path,
                        thumbnail: img.thumbnail_path,
                        is_cover: !!img.is_cover
                    }))
                }
            });
        });
    });
});
router.get('/', (req, res) => {
    const {
        city_id,
        is_new,
        possible_exchange,
        min_price,
        max_price,
        page = 1,
        limit = 12
    } = req.query;

    const filters = [];
    const values = [];

    if (city_id) {
        filters.push('m.city_id = ?');
        values.push(city_id);
    }
    if (is_new !== undefined) {
        filters.push('m.is_new = ?');
        values.push(is_new === 'true');
    }
    if (possible_exchange !== undefined) {
        filters.push('m.possible_exchange = ?');
        values.push(possible_exchange === 'true');
    }
    if (min_price) {
        filters.push('m.price >= ?');
        values.push(Number(min_price));
    }
    if (max_price) {
        filters.push('m.price <= ?');
        values.push(Number(max_price));
    }

    const offset = (Number(page) - 1) * Number(limit);

    const whereClause = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

    const sql = `
        SELECT m.id,
               m.title,
               m.price,
               m.is_new,
               m.possible_exchange,
               m.city_id,
               m.publish_date,
               img.thumbnail_path AS cover_thumb
        FROM market_ads m
                 LEFT JOIN market_ad_images img ON img.ad_id = m.id AND img.is_cover = true
            ${whereClause}
        ORDER BY m.publish_date DESC
            LIMIT ?
        OFFSET ?
    `;

    db.query(sql, [...values, Number(limit), offset], (err, results) => {
        if (err) {
            console.error('Ошибка при получении списка объявлений:', err);
            return res.status(500).json({message: 'Ошибка сервера'});
        }

        res.json({ads: results});
    });
});

router.put('/:id', verifyToken, (req, res) => {
    const userId = req.user.userId;
    const adId = req.params.id;

    const {
        title,
        description,
        is_new,
        possible_exchange,
        city_id,
        price,
        cover_image_id,
        image_ids
    } = req.body;

    if (!title || !price || !city_id || !Array.isArray(image_ids) || image_ids.length === 0) {
        return res.status(400).json({ message: 'Обязательные поля: title, price, city_id, image_ids' });
    }

    // Проверка принадлежности объявления
    db.query('SELECT * FROM market_ads WHERE id = ? AND user_id = ?', [adId, userId], (err, ads) => {
        if (err || ads.length === 0) {
            return res.status(403).json({ message: 'Объявление не найдено или нет доступа' });
        }

        // Обновляем объявление
        const updateAdSql = `
            UPDATE market_ads
            SET title = ?, description = ?, is_new = ?, possible_exchange = ?, city_id = ?, price = ?, cover_image_id = ?
            WHERE id = ?
        `;
        db.query(updateAdSql, [
            title,
            description,
            !!is_new,
            !!possible_exchange,
            city_id,
            price,
            cover_image_id,
            adId
        ], (err) => {
            if (err) {
                console.error('Ошибка при обновлении объявления:', err);
                return res.status(500).json({ message: 'Ошибка при обновлении объявления' });
            }

            // Получаем текущие фото
            db.query('SELECT id, file_path, thumbnail_path FROM market_ad_images WHERE ad_id = ?', [adId], (err, currentImages) => {
                if (err) return res.status(500).json({ message: 'Ошибка при получении изображений' });

                const currentIds = currentImages.map(img => img.id);
                const removedIds = currentIds.filter(id => !image_ids.includes(id));

                // Удаление файлов и записей
                const deleteImages = () => {
                    if (removedIds.length === 0) return updateRemainingImages();

                    currentImages.forEach(img => {
                        if (removedIds.includes(img.id)) {
                            [img.file_path, img.thumbnail_path].forEach(p => {
                                if (fs.existsSync(p)) fs.unlinkSync(p);
                            });
                        }
                    });

                    db.query('DELETE FROM market_ad_images WHERE id IN (?)', [removedIds], (err) => {
                        if (err) return res.status(500).json({ message: 'Ошибка при удалении старых изображений' });
                        updateRemainingImages();
                    });
                };

                const updateRemainingImages = () => {
                    const updateSql = `
            UPDATE market_ad_images
            SET ad_id = ?, is_cover = CASE WHEN id = ? THEN true ELSE false END
            WHERE id IN (?)
          `;
                    db.query(updateSql, [adId, cover_image_id, image_ids], (err) => {
                        if (err) {
                            console.error('Ошибка при обновлении фото:', err);
                            return res.status(500).json({ message: 'Ошибка при обновлении изображений' });
                        }

                        res.json({ message: 'Объявление обновлено' });
                    });
                };

                deleteImages();
            });
        });
    });
});


router.delete('/:id', verifyToken, (req, res) => {
    const userId = req.user.userId;
    const adId = req.params.id;

    // Проверка владельца
    db.query('SELECT * FROM market_ads WHERE id = ? AND user_id = ?', [adId, userId], (err, ads) => {
        if (err || ads.length === 0) {
            return res.status(403).json({ message: 'Объявление не найдено или нет доступа' });
        }

        // Удалить изображения
        db.query('SELECT * FROM market_ad_images WHERE ad_id = ?', [adId], (err, images) => {
            if (err) return res.status(500).json({ message: 'Ошибка при получении изображений' });

            const fs = require('fs');
            images.forEach(img => {
                [img.file_path, img.thumbnail_path].forEach(p => {
                    if (fs.existsSync(p)) fs.unlinkSync(p);
                });
            });

            // Удаление из market_ad_images
            db.query('DELETE FROM market_ad_images WHERE ad_id = ?', [adId], (err) => {
                if (err) return res.status(500).json({ message: 'Ошибка при удалении изображений' });

                // Удаление самого объявления
                db.query('DELETE FROM market_ads WHERE id = ?', [adId], (err) => {
                    if (err) return res.status(500).json({ message: 'Ошибка при удалении объявления' });

                    res.json({ message: 'Объявление удалено' });
                });
            });
        });
    });
});
module.exports = router;
