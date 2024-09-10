const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const db = require('../db'); // Подключение к базе данных
const fs = require('fs');
const bcrypt = require('bcrypt');
// Добавление группы
router.post('/bands', verifyToken, (req, res) => {
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
        band_form_date
    } = req.body;

    const userId = req.user.userId; // Получаем ID пользователя из токена

    // SQL-запрос для добавления группы
    const sqlInsertBand = `
        INSERT INTO bands (name, city_id, exp_band, exp_band_action, base, self_creation, com_project, cover_band, text, spotify, applemus, youtube, yandexmus, band_form_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sqlInsertBand, [
        name, city_id, exp_band, exp_band_action, base, self_creation, com_project, cover_band, text, spotify, applemus, youtube, yandexmus, band_form_date
    ], (err, result) => {
        if (err) {
            console.error('Ошибка при создании группы:', err);
            return res.status(500).json({ message: 'Ошибка сервера при создании группы' });
        }

        const bandId = result.insertId; // Получаем ID созданной группы

        // Добавление создателя группы в таблицу band_members с ролью админа
        const sqlInsertMember = `INSERT INTO band_members (band_id, user_id, role) VALUES (?, ?, 'admin')`;
        db.query(sqlInsertMember, [bandId, userId], (err, result) => {
            if (err) {
                console.error('Ошибка при добавлении пользователя в band_members:', err);
                return res.status(500).json({ message: 'Ошибка при добавлении пользователя в band_members' });
            }

            // Если переданы жанры, добавляем их в таблицу связи band_genres
            if (genre_ids && genre_ids.length > 0) {
                const genreValues = genre_ids.map(genre_id => [bandId, genre_id]);

                const sqlInsertGenres = `INSERT INTO band_genres (band_id, genre_id) VALUES ?`;
                db.query(sqlInsertGenres, [genreValues], (err, result) => {
                    if (err) {
                        console.error('Ошибка при добавлении жанров:', err);
                        return res.status(500).json({ message: 'Ошибка при добавлении жанров' });
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
// Редактирование группы
router.put('/bands/:id', verifyToken, (req, res) => {
    const bandId = req.params.id; // ID группы из URL
    const userId = req.user.userId; // ID пользователя из токена

    const {
        name,
        city_id,
        genre_ids,
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
        band_form_date
    } = req.body;

    // Проверяем, что пользователь является администратором группы
    const sqlCheckAdmin = `SELECT * FROM band_members WHERE band_id = ? AND user_id = ? AND role = 'admin'`;
    db.query(sqlCheckAdmin, [bandId, userId], (err, results) => {
        if (err) {
            console.error('Ошибка при проверке прав на редактирование:', err);
            return res.status(500).json({ message: 'Ошибка сервера при проверке прав' });
        }

        if (results.length === 0) {
            return res.status(403).json({ message: 'У вас нет прав на редактирование этой группы' });
        }

        // Обновляем данные группы
        const sqlUpdateBand = `
            UPDATE bands
            SET name = ?, city_id = ?, exp_band = ?, exp_band_action = ?, base = ?, self_creation = ?, com_project = ?, cover_band = ?, text = ?, spotify = ?, applemus = ?, youtube = ?, yandexmus = ?, band_form_date = ?
            WHERE id = ?
        `;

        db.query(sqlUpdateBand, [
            name, city_id, exp_band, exp_band_action, base, self_creation, com_project, cover_band, text, spotify, applemus, youtube, yandexmus, band_form_date, bandId
        ], (err, result) => {
            if (err) {
                console.error('Ошибка при обновлении группы:', err);
                return res.status(500).json({ message: 'Ошибка сервера при обновлении группы' });
            }

            // Обновляем жанры группы: сначала удаляем старые жанры, затем добавляем новые
            const sqlDeleteGenres = `DELETE FROM band_genres WHERE band_id = ?`;
            db.query(sqlDeleteGenres, [bandId], (err, result) => {
                if (err) {
                    console.error('Ошибка при удалении старых жанров:', err);
                    return res.status(500).json({ message: 'Ошибка при удалении старых жанров' });
                }

                // Добавляем новые жанры
                if (genre_ids && genre_ids.length > 0) {
                    const genreValues = genre_ids.map(genre_id => [bandId, genre_id]);

                    const sqlInsertGenres = `INSERT INTO band_genres (band_id, genre_id) VALUES ?`;
                    db.query(sqlInsertGenres, [genreValues], (err, result) => {
                        if (err) {
                            console.error('Ошибка при добавлении новых жанров:', err);
                            return res.status(500).json({ message: 'Ошибка при добавлении новых жанров' });
                        }

                        res.json({
                            message: 'Группа успешно обновлена'
                        });
                    });
                } else {
                    res.json({
                        message: 'Группа успешно обновлена'
                    });
                }
            });
        });
    });
});
// Удаление группы
const deleteGroupAvatar = (groupId, callback) => {
    const sqlSelectImage = 'SELECT original_path, thumbnail_path FROM images WHERE owner_id = ? AND owner_type = "group"';
    db.query(sqlSelectImage, [groupId], (err, results) => {
        if (err) return callback(err);

        if (results.length > 0) {
            const { original_path, thumbnail_path } = results[0];

            // Удаляем оригинал и миниатюру, если они существуют
            if (fs.existsSync(original_path)) {
                fs.unlinkSync(original_path);
            }
            if (fs.existsSync(thumbnail_path)) {
                fs.unlinkSync(thumbnail_path);
            }

            // Удаляем запись из базы данных
            const sqlDeleteImage = 'DELETE FROM images WHERE owner_id = ? AND owner_type = "group"';
            db.query(sqlDeleteImage, [groupId], (err) => {
                if (err) return callback(err);
                callback(null);
            });
        } else {
            callback(null);
        }
    });
};
// API для удаления группы
router.delete('/bands/:id', verifyToken, (req, res) => {
    const bandId = req.params.id; // ID группы из URL
    const userId = req.user.userId; // ID пользователя из токена

    // Проверяем, что пользователь является администратором группы
    const sqlCheckAdmin = `SELECT * FROM band_members WHERE band_id = ? AND user_id = ? AND role = 'admin'`;
    db.query(sqlCheckAdmin, [bandId, userId], (err, results) => {
        if (err) {
            console.error('Ошибка при проверке прав на удаление:', err);
            return res.status(500).json({ message: 'Ошибка сервера при проверке прав' });
        }

        if (results.length === 0) {
            return res.status(403).json({ message: 'У вас нет прав на удаление этой группы' });
        }

        // Удаляем аватар группы (если он есть)
        deleteGroupAvatar(bandId, (err) => {
            if (err) {
                console.error('Ошибка при удалении аватара группы:', err);
                return res.status(500).json({ message: 'Ошибка при удалении аватара группы' });
            }

            // Сначала удаляем всех участников группы
            const sqlDeleteMembers = `DELETE FROM band_members WHERE band_id = ?`;
            db.query(sqlDeleteMembers, [bandId], (err) => {
                if (err) {
                    console.error('Ошибка при удалении участников группы:', err);
                    return res.status(500).json({ message: 'Ошибка при удалении участников группы' });
                }

                // Удаляем саму группу
                const sqlDeleteBand = `DELETE FROM bands WHERE id = ?`;
                db.query(sqlDeleteBand, [bandId], (err, result) => {
                    if (err) {
                        console.error('Ошибка при удалении группы:', err);
                        return res.status(500).json({ message: 'Ошибка сервера при удалении группы' });
                    }

                    res.json({
                        message: 'Группа, участники и аватар успешно удалены'
                    });
                });
            });
        });
    });
});
// Получение всех групп, в которых участвует пользователь
// Получение всех групп, в которых участвует пользователь
// Получение всех групп, в которых участвует пользователь
// Получение всех групп, в которых участвует пользователь
router.get('/bands/user-bands', verifyToken, (req, res) => {
    const userId = req.user.userId; // ID пользователя из токена

    // SQL-запрос для получения всех групп, в которых участвует пользователь, и их фото и роль
    const sqlGetUserBands = `
        SELECT b.id, b.name, b.city_id, b.exp_band, b.exp_band_action, b.base, b.self_creation, 
               b.com_project, b.cover_band, b.text, b.spotify, b.applemus, b.youtube, b.yandexmus, 
               b.band_form_date, i.id AS image_id, i.original_path, i.thumbnail_path, bm.role
        FROM band_members bm
        JOIN bands b ON bm.band_id = b.id
        LEFT JOIN images i ON b.id = i.owner_id AND i.owner_type = 'group'
        WHERE bm.user_id = ?
    `;

    db.query(sqlGetUserBands, [userId], (err, results) => {
        if (err) {
            console.error('Ошибка при получении групп пользователя:', err);
            return res.status(500).json({ message: 'Ошибка сервера при получении групп' });
        }

        // Формируем ответ с объектом изображения и роли пользователя
        const formattedResults = results.map(band => ({
            id: band.id,
            name: band.name,
            city_id: band.city_id,
            exp_band: band.exp_band,
            exp_band_action: band.exp_band_action,
            base: band.base,
            self_creation: band.self_creation,
            com_project: band.com_project,
            cover_band: band.cover_band,
            text: band.text,
            spotify: band.spotify,
            applemus: band.applemus,
            youtube: band.youtube,
            yandexmus: band.yandexmus,
            band_form_date: band.band_form_date,
            image: band.image_id ? {
                id: band.image_id,
                thumbnail: band.thumbnail_path,
                full: band.original_path
            } : null,
            role: band.role // Роль пользователя в группе
        }));

        res.json({
            message: 'Список групп успешно получен',
            bands: formattedResults
        });
    });
});
// Получение информации о группе по ID
// Получение информации о группе по ID
// Получение информации о группе по ID
router.get('/bands/:id', verifyToken, (req, res) => {
    const bandId = req.params.id; // ID группы из URL

    // SQL-запрос для получения данных о группе и ее фото
    const sqlGetBandById = `
        SELECT b.id, b.name, b.city_id, b.exp_band, b.exp_band_action, b.base, b.self_creation, 
               b.com_project, b.cover_band, b.text, b.spotify, b.applemus, b.youtube, b.yandexmus, 
               b.band_form_date, 
               (SELECT GROUP_CONCAT(bg.genre_id) FROM band_genres bg WHERE bg.band_id = b.id) AS genre_ids,
               i.id AS image_id, i.original_path, i.thumbnail_path
        FROM bands b
        LEFT JOIN images i ON b.id = i.owner_id AND i.owner_type = 'group'
        WHERE b.id = ?
    `;

    db.query(sqlGetBandById, [bandId], (err, result) => {
        if (err) {
            console.error('Ошибка при получении группы по ID:', err);
            return res.status(500).json({ message: 'Ошибка сервера при получении группы' });
        }

        if (result.length === 0) {
            return res.status(404).json({ message: 'Группа не найдена' });
        }

        // Формируем ответ с объектом изображения
        const band = result[0];
        const formattedBand = {
            id: band.id,
            name: band.name,
            city_id: band.city_id,
            exp_band: band.exp_band,
            exp_band_action: band.exp_band_action,
            base: band.base,
            self_creation: band.self_creation,
            com_project: band.com_project,
            cover_band: band.cover_band,
            text: band.text,
            spotify: band.spotify,
            applemus: band.applemus,
            youtube: band.youtube,
            yandexmus: band.yandexmus,
            band_form_date: band.band_form_date,
            genre_ids: band.genre_ids ? band.genre_ids.split(',') : [],
            image: band.image_id ? {
                id: band.image_id,
                thumbnail: band.thumbnail_path,
                full: band.original_path
            } : null
        };

        res.json({
            message: 'Информация о группе успешно получена',
            band: formattedBand
        });
    });
});
// API для получения всех участников группы
router.get('/bands/:id/members', verifyToken, (req, res) => {
    const bandId = req.params.id; // ID группы из URL

    // SQL-запрос для получения всех участников группы, включая аватарку, никнейм и инструменты
    const sqlGetBandMembers = `
        SELECT u.id AS user_id, u.name, u.email, u.nickname, bm.role, i.original_path AS avatar, 
               GROUP_CONCAT(bmi.instrument_id) AS instrument_ids
        FROM band_members bm
        JOIN users u ON bm.user_id = u.id
        LEFT JOIN images i ON u.id = i.owner_id AND i.owner_type = 'user'
        LEFT JOIN band_member_instruments bmi ON bm.id = bmi.band_member_id
        WHERE bm.band_id = ?
        GROUP BY u.id, u.name, u.email, u.nickname, bm.role, i.original_path
    `;

    db.query(sqlGetBandMembers, [bandId], (err, results) => {
        if (err) {
            console.error('Ошибка при получении участников группы:', err);
            return res.status(500).json({ message: 'Ошибка сервера при получении участников' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'Участники не найдены' });
        }

        res.json({
            message: 'Список участников группы успешно получен',
            members: results.map(member => ({
                id: member.user_id,
                name: member.name,
                email: member.email,
                nickname: member.nickname, // Никнейм участника
                role: member.role, // Роль участника (админ, модератор и т.д.)
                avatar: member.avatar, // Ссылка на аватар
                instruments: member.instrument_ids ? member.instrument_ids.split(',').map(el => Number(el)) : [] // Список инструментов
            }))
        });
    });
});
// API для обновления инструментов участника группы
router.put('/bands/:bandId/members/:userId/instruments', verifyToken, (req, res) => {
    const bandId = req.params.bandId; // ID группы из URL
    const userId = req.params.userId; // ID участника из URL
    const { instrument_ids } = req.body; // Массив инструментов для участника

    if (!Array.isArray(instrument_ids)) {
        return res.status(400).json({ message: 'instrument_ids должен быть массивом' });
    }

    // Проверка прав (только admin или moderator могут редактировать)
    const sqlCheckAdminOrModerator = `
        SELECT * FROM band_members 
        WHERE band_id = ? AND user_id = ? AND role IN ('admin', 'moderator')
    `;
    const currentUserId = req.user.userId; // Текущий авторизованный пользователь

    db.query(sqlCheckAdminOrModerator, [bandId, currentUserId], (err, results) => {
        if (err) {
            console.error('Ошибка при проверке прав:', err);
            return res.status(500).json({ message: 'Ошибка сервера при проверке прав' });
        }

        if (results.length === 0) {
            return res.status(403).json({ message: 'У вас нет прав на редактирование инструментов участника' });
        }

        // Проверка существования участника группы по user_id
        const sqlCheckMemberExists = `SELECT * FROM band_members WHERE band_id = ? AND user_id = ?`;
        db.query(sqlCheckMemberExists, [bandId, userId], (err, results) => {
            if (err || results.length === 0) {
                return res.status(404).json({ message: 'Участник группы не найден' });
            }

            const bandMemberId = results[0].id; // Получаем band_member_id для удаления и вставки инструментов

            // Удаляем старые инструменты участника
            const sqlDeleteInstruments = `DELETE FROM band_member_instruments WHERE band_member_id = ?`;
            db.query(sqlDeleteInstruments, [bandMemberId], (err) => {
                if (err) {
                    console.error('Ошибка при удалении старых инструментов участника:', err);
                    return res.status(500).json({ message: 'Ошибка при удалении старых инструментов' });
                }

                // Вставляем новые инструменты
                if (instrument_ids.length > 0) {
                    const instrumentValues = instrument_ids.map(instrumentId => [bandMemberId, instrumentId]);

                    const sqlInsertInstruments = `INSERT INTO band_member_instruments (band_member_id, instrument_id) VALUES ?`;
                    db.query(sqlInsertInstruments, [instrumentValues], (err, result) => {
                        if (err) {
                            console.error('Ошибка при добавлении инструментов:', err);
                            return res.status(500).json({ message: 'Ошибка при добавлении инструментов' });
                        }

                        res.json({
                            message: 'Инструменты участника успешно обновлены'
                        });
                    });
                } else {
                    res.json({
                        message: 'Инструменты участника успешно обновлены (без инструментов)'
                    });
                }
            });
        });
    });
});
// API для создания объявления группы
router.post('/bands/:bandId/ads', verifyToken, (req, res) => {
    const bandId = req.params.bandId; // ID группы из URL
    const { instrument_id, description, exp, exp_action, self_instr } = req.body; // Поля из тела запроса

    // Проверка, что все необходимые поля переданы
    if (!instrument_id || !description) {
        return res.status(400).json({ message: 'instrument_id и description обязательны для заполнения' });
    }

    // Проверка прав: только админ или модератор группы могут создавать объявления
    const sqlCheckAdminOrModerator = `
        SELECT * FROM band_members 
        WHERE band_id = ? AND user_id = ? AND role IN ('admin', 'moderator')
    `;
    const userId = req.user.userId; // ID текущего авторизованного пользователя

    db.query(sqlCheckAdminOrModerator, [bandId, userId], (err, results) => {
        if (err) {
            console.error('Ошибка при проверке прав:', err);
            return res.status(500).json({ message: 'Ошибка сервера при проверке прав' });
        }

        if (results.length === 0) {
            return res.status(403).json({ message: 'У вас нет прав на создание объявления' });
        }

        // Вставляем новое объявление в таблицу
        const sqlInsertAd = `
            INSERT INTO band_search_ads (band_id, instrument_id, description, exp, exp_action, self_instr) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        db.query(sqlInsertAd, [bandId, instrument_id, description, exp, exp_action, self_instr], (err, result) => {
            if (err) {
                console.error('Ошибка при создании объявления:', err);
                return res.status(500).json({ message: 'Ошибка при создании объявления' });
            }

            res.json({
                message: 'Объявление успешно создано',
                adId: result.insertId
            });
        });
    });
});
// API для получения всех объявлений группы
router.get('/bands/:bandId/ads', verifyToken, (req, res) => {
    const bandId = req.params.bandId; // ID группы из URL

    // SQL-запрос для получения всех объявлений группы
    const sqlGetBandAds = `
        SELECT id, instrument_id, description, exp, exp_action, self_instr, status 
        FROM band_search_ads 
        WHERE band_id = ?
    `;

    db.query(sqlGetBandAds, [bandId], (err, results) => {
        if (err) {
            console.error('Ошибка при получении объявлений группы:', err);
            return res.status(500).json({ message: 'Ошибка сервера при получении объявлений' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'Объявления не найдены' });
        }

        res.json({
            message: 'Объявления группы успешно получены',
            ads: results
        });
    });
});

module.exports = router;
