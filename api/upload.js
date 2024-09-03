const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const db = require('../db'); // Подключение к базе данных

// Функция для удаления старых изображений
const deleteOldAvatar = (userId, callback) => {
    const sqlSelectImage = 'SELECT original_path, thumbnail_path FROM images WHERE owner_id = ? AND owner_type = "user"';
    db.query(sqlSelectImage, [userId], (err, results) => {
        if (err) return callback(err);

        if (results.length > 0) {
            const {original_path, thumbnail_path} = results[0];

            // Удаляем оригинал и миниатюру, если они существуют
            if (fs.existsSync(original_path)) {
                fs.unlinkSync(original_path);
            }
            if (fs.existsSync(thumbnail_path)) {
                fs.unlinkSync(thumbnail_path);
            }

            // Удаляем запись из базы данных
            const sqlDeleteImage = 'DELETE FROM images WHERE owner_id = ? AND owner_type = "user"';
            db.query(sqlDeleteImage, [userId], (err) => {
                if (err) return callback(err);
                callback(null);
            });
        } else {
            callback(null);
        }
    });
};

// Настройка multer
// Настройка multer для хранения файлов в памяти
const storage = multer.memoryStorage(); // Хранение файлов в памяти

const upload = multer({
    storage: storage,
    limits: {fileSize: 10 * 1024 * 1024}
});

router.post('/upload', verifyToken, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({message: 'Файл не был загружен'});
    }

    const {type} = req.body;
    let uploadPath;
    let actualOwnerId = req.user.userId; // Получаем ID пользователя из токена

    if (type !== 'user') {
        return res.status(400).json({message: 'Неверный тип. Только аватары пользователя поддерживаются.'});
    }

    uploadPath = 'uploads/users/';

    // Генерируем пути для сохранения
    const fileName = `${Date.now()}.jpg`;
    const finalOriginalPath = path.join(uploadPath, fileName);
    const thumbnailPath = path.join(uploadPath, 'thumbnails', fileName);

    // Обрабатываем файл напрямую из памяти
    sharp(req.file.buffer)
        .resize(300, 300)
        .toFile(thumbnailPath)
        .then(() => {
            // Если размер файла больше 5МБ, сжимаем его и сохраняем в оригинальный путь
            if (req.file.size > 5 * 1024 * 1024) {
                return sharp(req.file.buffer)
                    .resize(1920, 1024, {fit: 'inside'})
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
                VALUES (?, "user", ?, ?)
            `;
            db.query(sqlInsertImage, [actualOwnerId, finalOriginalPath, thumbnailPath], (err, result) => {
                if (err) {
                    console.error('Ошибка при сохранении изображения в базу данных:', err);
                    return res.status(500).json({message: 'Ошибка при сохранении изображения'});
                }

                res.json({
                    message: 'Аватар успешно загружен и сохранен',
                    imageId: result.insertId,
                    originalPath: finalOriginalPath,
                    thumbnailPath: thumbnailPath
                });
            });
            const memoryUsage = process.memoryUsage();

            console.log('Memory Usage:');
            console.log(`RSS (Resident Set Size): ${memoryUsage.rss / 1024 / 1024} MB`);
            console.log(`Heap Total: ${memoryUsage.heapTotal / 1024 / 1024} MB`);
            console.log(`Heap Used: ${memoryUsage.heapUsed / 1024 / 1024} MB`);
            console.log(`External: ${memoryUsage.external / 1024 / 1024} MB`);
            console.log(`Array Buffers: ${memoryUsage.arrayBuffers / 1024 / 1024} MB`);

        })
        .catch(err => {
            console.error('Ошибка при обработке изображения:', err);
            res.status(500).json({message: 'Ошибка при обработке изображения'});
        });
});

module.exports = router;
