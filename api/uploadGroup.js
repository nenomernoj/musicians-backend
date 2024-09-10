const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const db = require('../db'); // Подключение к базе данных

// Функция для удаления старого аватара группы
const deleteOldGroupAvatar = (groupId, callback) => {
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

// Настройка multer для хранения файлов в памяти
const storage = multer.memoryStorage(); // Хранение файлов в памяти

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // Лимит файла 10MB
});

// API для загрузки аватара группы
router.post('/group/:id/upload-avatar', verifyToken, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Файл не был загружен' });
    }

    const groupId = req.params.id; // ID группы из URL
    const { type } = req.body;

    if (type !== 'group') {
        return res.status(400).json({ message: 'Неверный тип. Только аватары группы поддерживаются.' });
    }

    const uploadPath = 'uploads/groups/';

    // Генерируем пути для сохранения
    const fileName = `${Date.now()}.jpg`;
    const finalOriginalPath = path.join(uploadPath, fileName);
    const thumbnailPath = path.join(uploadPath, 'thumbnails', fileName);

    // Убедимся, что директория существует
    if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
    }
    if (!fs.existsSync(path.join(uploadPath, 'thumbnails'))) {
        fs.mkdirSync(path.join(uploadPath, 'thumbnails'), { recursive: true });
    }

    // Удаляем старый аватар группы
    deleteOldGroupAvatar(groupId, (err) => {
        if (err) {
            console.error('Ошибка при удалении старого аватара:', err);
            return res.status(500).json({ message: 'Ошибка при удалении старого аватара' });
        }

        // Обрабатываем файл напрямую из памяти
        sharp(req.file.buffer)
            .resize(300, 300)
            .toFile(thumbnailPath)
            .then(() => {
                // Если размер файла больше 5МБ, сжимаем его и сохраняем в оригинальный путь
                if (req.file.size > 5 * 1024 * 1024) {
                    return sharp(req.file.buffer)
                        .resize(1920, 1024, { fit: 'inside' })
                        .toFile(finalOriginalPath);
                } else {
                    // Если файл меньше 5МБ, сохраняем его напрямую
                    return sharp(req.file.buffer).toFile(finalOriginalPath);
                }
            })
            .then(() => {
                // Сохранение информации об изображении в базе данных (пример)
                const sqlInsertImage = `
                    INSERT INTO images (owner_id, owner_type, original_path, thumbnail_path)
                    VALUES (?, "group", ?, ?)
                `;
                db.query(sqlInsertImage, [groupId, finalOriginalPath, thumbnailPath], (err, result) => {
                    if (err) {
                        console.error('Ошибка при сохранении изображения в базу данных:', err);
                        return res.status(500).json({ message: 'Ошибка при сохранении изображения' });
                    }

                    res.json({
                        message: 'Аватар группы успешно загружен и сохранен',
                        imageId: result.insertId,
                        originalPath: finalOriginalPath,
                        thumbnailPath: thumbnailPath
                    });
                });
            })
            .catch(err => {
                console.error('Ошибка при обработке изображения:', err);
                res.status(500).json({ message: 'Ошибка при обработке изображения' });
            });
    });
});
// Функция для удаления аватара группы
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

// API для удаления аватара группы
router.delete('/group/:groupId/delete-avatar', verifyToken, (req, res) => {
    const groupId = req.params.groupId; // ID группы из URL
    const userId = req.user.userId; // ID пользователя из токена

    // Проверка, является ли пользователь администратором или модератором группы
    const sqlCheckRole = `
        SELECT role FROM band_members WHERE band_id = ? AND user_id = ? AND (role = 'admin' OR role = 'moderator')
    `;

    db.query(sqlCheckRole, [groupId, userId], (err, results) => {
        if (err) {
            console.error('Ошибка при проверке роли пользователя:', err);
            return res.status(500).json({ message: 'Ошибка сервера' });
        }

        if (results.length === 0) {
            return res.status(403).json({ message: 'У вас нет прав для удаления аватара группы' });
        }

        // Удаляем аватар группы
        deleteGroupAvatar(groupId, (err) => {
            if (err) {
                console.error('Ошибка при удалении аватара группы:', err);
                return res.status(500).json({ message: 'Ошибка при удалении аватара группы' });
            }

            res.json({ message: 'Аватар группы успешно удален' });
        });
    });
});
module.exports = router;
