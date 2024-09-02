const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const db = require('../db'); // Подключение к базе данных
const bcrypt = require('bcrypt');
// Защищённый маршрут для получения профиля пользователя
router.get('/profile', verifyToken, (req, res) => {
    const userId = req.user.userId; // Извлекаем userId из токена

    // SQL-запрос для получения данных пользователя, ID инструментов и полей соцсетей
    const sql = `
        SELECT 
            u.id, u.email, u.name, u.city_id, u.nickname, u.phone, u.birthday, u.status, u.avatarId,
            u.vk, u.facebook, u.instagram,  -- поля с маленькой буквы
            GROUP_CONCAT(ui.instrument_id) AS instrument_ids
        FROM users u
        LEFT JOIN user_instruments ui ON u.id = ui.user_id
        WHERE u.id = ?
        GROUP BY u.id
    `;

    db.query(sql, [userId], (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Server error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = results[0];
        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            city_id: user.city_id,
            nickname: user.nickname,
            phone: user.phone,
            birthday: user.birthday,
            status: user.status,
            avatarId: user.avatarId,
            vk: user.vk,             // поле с маленькой буквы
            facebook: user.facebook, // поле с маленькой буквы
            instagram: user.instagram, // поле с маленькой буквы
            user_instruments: user.instrument_ids ? user.instrument_ids.split(',').map(Number) : []
        });
    });
});
// Маршрут для обновления профиля пользователя
router.put('/profile', verifyToken, (req, res) => {
    const userId = req.user.userId; // Извлекаем userId из токена

    const {
        name,
        city_id,
        nickname,
        phone,
        birthday,
        vk,
        facebook,
        instagram,
        user_instruments
    } = req.body;

    // Обновление данных пользователя в таблице users
    const sqlUpdateUser = `
        UPDATE users 
        SET name = ?, city_id = ?, nickname = ?, phone = ?, birthday = ?, vk = ?, facebook = ?, instagram = ?
        WHERE id = ?
    `;

    db.query(sqlUpdateUser, [name, city_id, nickname, phone, birthday, vk, facebook, instagram, userId], (err, result) => {
        if (err) {
            return res.status(500).json({ message: err });
        }

        // Удаление текущих инструментов пользователя
        const sqlDeleteInstruments = `DELETE FROM user_instruments WHERE user_id = ?`;

        db.query(sqlDeleteInstruments, [userId], (err, result) => {
            if (err) {
                return res.status(500).json({ message: 'Error clearing user instruments' });
            }

            // Вставка новых инструментов пользователя
            if (user_instruments && user_instruments.length > 0) {
                const sqlInsertInstruments = `
                    INSERT INTO user_instruments (user_id, instrument_id) VALUES ?
                `;
                const instrumentData = user_instruments.map(instrument_id => [userId, instrument_id]);

                db.query(sqlInsertInstruments, [instrumentData], (err, result) => {
                    if (err) {
                        return res.status(500).json({ message: 'Error updating user instruments' });
                    }

                    return res.json({ message: 'Profile updated successfully' });
                });
            } else {
                return res.json({ message: 'Profile updated successfully' });
            }
        });
    });
});
// Маршрут для смены пароля пользователя
router.put('/change-password', verifyToken, (req, res) => {
    const userId = req.user.userId; // Извлекаем userId из токена
    const { old_password, new_password } = req.body;

    if (!old_password || !new_password) {
        return res.status(400).json({ message: 'Требуется указать старый и новый пароли' });
    }

    if (new_password.length < 6) {
        return res.status(400).json({ message: 'Новый пароль должен содержать не менее 6 символов' });
    }

    // SQL-запрос для получения текущего пароля пользователя
    const sqlGetUser = `SELECT password FROM users WHERE id = ?`;

    db.query(sqlGetUser, [userId], (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Ошибка сервера' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        const user = results[0];

        // Сравнение старого пароля с текущим
        bcrypt.compare(old_password, user.password, (err, isMatch) => {
            if (err) {
                return res.status(500).json({ message: 'Ошибка при сравнении паролей' });
            }

            if (!isMatch) {
                return res.status(400).json({ message: 'Старый пароль введен неправильно' });
            }

            // Хэширование нового пароля
            bcrypt.hash(new_password, 10, (err, hashedPassword) => {
                if (err) {
                    return res.status(500).json({ message: 'Ошибка при хэшировании нового пароля' });
                }

                // Обновление пароля в базе данных
                const sqlUpdatePassword = `UPDATE users SET password = ? WHERE id = ?`;

                db.query(sqlUpdatePassword, [hashedPassword, userId], (err, result) => {
                    if (err) {
                        return res.status(500).json({ message: 'Ошибка при обновлении пароля' });
                    }

                    return res.json({ message: 'Пароль успешно изменен' });
                });
            });
        });
    });
});

module.exports = router;
