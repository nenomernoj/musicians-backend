const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const db = require('../db'); // Подключение к базе данных

// Настройка multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'uploads/'; // Временное место для хранения файла до обработки
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const fileName = `${Date.now()}${ext}`;
        cb(null, fileName);
    }
});

const upload = multer({ storage: storage });

router.post('/upload', verifyToken, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Файл не был загружен' });
    }

    const { type, owner_id } = req.body;
    let uploadPath;
    let actualOwnerId = owner_id;

    if (!type) {
        return res.status(400).json({ message: 'Тип не определен' });
    }

    if (type === 'user') {
        actualOwnerId = req.user.userId;
        uploadPath = 'uploads/users/';
    } else if (type === 'group') {
        uploadPath = 'uploads/groups/avatars/';
    } else if (type === 'listing') {
        uploadPath = 'uploads/listings/photos/';
    } else {
        return res.status(400).json({ message: 'Неверный тип' });
    }

    // Обновление пути в req.uploadPath для сохранения файла
    req.uploadPath = uploadPath;

    const finalOriginalPath = `${uploadPath}${req.file.filename}`;
    const thumbnailPath = `${uploadPath}thumbnails/${req.file.filename}`;

    sharp(req.file.path)
        .resize(300, 300)
        .toFile(thumbnailPath)
        .then(() => {
            const { size } = fs.statSync(req.file.path);
            if (size > 5 * 1024 * 1024) {
                // Если размер файла больше 5МБ, сжимаем его и сохраняем в оригинальный путь
                return sharp(req.file.path)
                    .resize(1920, 1024, { fit: 'inside' })
                    .toFile(finalOriginalPath)
                    .then(() => {
                        fs.unlinkSync(req.file.path); // Удаляем временный файл после сжатия
                    });
            } else {
                // Если файл меньше 5МБ, просто сохраняем его
                return fs.renameSync(req.file.path, finalOriginalPath); // Перемещаем файл
            }
        })
        .then(() => {
            const sqlInsertImage = `
                INSERT INTO images (owner_id, owner_type, original_path, thumbnail_path)
                VALUES (?, ?, ?, ?)
            `;
            db.query(sqlInsertImage, [actualOwnerId, type, finalOriginalPath, thumbnailPath], (err, result) => {
                if (err) {
                    console.error('Ошибка при сохранении изображения в базу данных:', err);
                    return res.status(500).json({ message: 'Ошибка при сохранении изображения' });
                }

                res.json({
                    message: 'Изображение успешно загружено и сохранено',
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

module.exports = router;
