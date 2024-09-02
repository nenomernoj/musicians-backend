const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');

// Функция для проверки и создания папки, если она не существует
const ensureDirectoryExistence = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// Настройка multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = req.uploadPath;
        if (!uploadPath) {
            return cb(new Error('Upload path is not defined'), '');
        }
        ensureDirectoryExistence(uploadPath);
        ensureDirectoryExistence(path.join(uploadPath, 'thumbnails'));
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const fileName = `${Date.now()}-${req.body.owner_id || req.user.userId}${ext}`;
        cb(null, fileName);
    }
});

const upload = multer({ storage: storage }).single('image');

router.post('/upload', verifyToken, (req, res, next) => {
    // Загрузка файла с использованием multer
    upload(req, res, function(err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ message: err.message });
        } else if (err) {
            return res.status(500).json({ message: 'Ошибка при загрузке файла' });
        }

        // После загрузки файла данные в req.body должны быть доступны
        const { type } = req.body;
        let owner_id;
        let uploadPath;

        if (!type) {
            return res.status(400).json({ message: 'Тип не определен' });
        }

        // Определение owner_id и uploadPath на основе типа
        if (type === 'user') {
            owner_id = req.user.userId;
            uploadPath = 'uploads/users/avatars/';
        } else if (type === 'group') {
            owner_id = req.body.owner_id;
            uploadPath = 'uploads/groups/avatars/';
        } else if (type === 'listing') {
            owner_id = req.body.owner_id;
            uploadPath = 'uploads/listings/photos/';
        } else {
            return res.status(400).json({ message: 'Неверный тип' });
        }

        req.uploadPath = uploadPath;
        req.body.owner_id = owner_id;

        // Продолжение обработки файла
        next();
    });
}, (req, res) => {
    // Обработка файла после загрузки
    if (!req.file) {
        return res.status(400).json({ message: 'Файл не был загружен' });
    }

    const { owner_id, type } = req.body;
    const originalPath = `${req.uploadPath}${req.file.filename}`;
    const thumbnailPath = `${req.uploadPath}thumbnails/${req.file.filename}`;

    // Пример обработки файла (создание миниатюры)
    sharp(req.file.path)
        .resize(300, 300)
        .toFile(thumbnailPath)
        .then(() => {
            const { size } = fs.statSync(req.file.path);
            if (size > 5 * 1024 * 1024) {
                return sharp(req.file.path)
                    .resize(1920, 1024, { fit: 'inside' })
                    .toFile(req.file.path);
            }
        })
        .then(() => {
            res.json({ message: 'Изображение успешно загружено', path: originalPath });
        })
        .catch(err => {
            console.error('Ошибка при обработке изображения:', err);
            res.status(500).json({ message: 'Ошибка при обработке изображения' });
        });
});

module.exports = router;
