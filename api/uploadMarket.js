const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const verifyToken = require('../middleware/verifyToken');

const uploadDir = 'uploads/market/';
const thumbDir = 'uploads/market/thumbs/';

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(thumbDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // max 10MB

// 📤 Загрузка фото барахолки
router.post('/upload/market', verifyToken, upload.single('file'), async (req, res) => {
    const file = req.file;
    const userId = req.user.userId;

    if (!file) {
        return res.status(400).json({ message: 'Файл не загружен' });
    }

    const filePath = file.path;

    // 👉 Ресайз если >5MB
    let finalPath = filePath;
    const stats = fs.statSync(filePath);
    if (stats.size > 5 * 1024 * 1024) {
        finalPath = filePath.replace(/(\.\w+)$/, '_resized$1');
        await sharp(filePath)
            .resize({ width: 1920, height: 1024, fit: 'inside' })
            .toFile(finalPath);
        fs.unlinkSync(filePath);
    }

    // 👉 Создание миниатюры
    const thumbFilename = 'thumb_' + path.basename(finalPath);
    const thumbPath = path.join(thumbDir, thumbFilename);
    await sharp(finalPath).resize(400, 300).toFile(thumbPath);

    // Сохраняем без ad_id, пока не прикреплён к объявлению
    const sql = `
    INSERT INTO market_ad_images (owner_id, file_path, thumbnail_path, is_cover)
    VALUES (?, ?, ?, false)
  `;
    db.query(sql, [userId, finalPath, thumbPath], (err, result) => {
        if (err) {
            console.error('DB error:', err);
            return res.status(500).json({ message: 'Ошибка при сохранении изображения' });
        }

        res.json({
            message: 'Файл загружен',
            imageId: result.insertId,
            filePath: finalPath,
            thumbPath
        });
    });
});

// 🗑️ Удаление фото барахолки
router.delete('/upload/market/:id', verifyToken, (req, res) => {
    const imageId = req.params.id;
    const userId = req.user.userId;

    const selectSql = `SELECT * FROM market_ad_images WHERE id = ? AND owner_id = ?`;
    db.query(selectSql, [imageId, userId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ message: 'Изображение не найдено или нет доступа' });
        }

        const image = results[0];

        if (image.ad_id) {
            return res.status(400).json({ message: 'Нельзя удалить — изображение прикреплено к объявлению' });
        }

        const deleteSql = `DELETE FROM market_ad_images WHERE id = ?`;
        db.query(deleteSql, [imageId], (err) => {
            if (err) return res.status(500).json({ message: 'Ошибка при удалении изображения' });

            [image.file_path, image.thumbnail_path].forEach(p => {
                if (fs.existsSync(p)) fs.unlinkSync(p);
            });

            res.json({ message: 'Изображение удалено' });
        });
    });
});

module.exports = router;
