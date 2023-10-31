const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const SECRET_KEY = '4af21293-e2aa-4677-9576-79a6ee755ea6';
const SECRET_KEY2 = '4af21293-e2aa-4677-9576-79a6ee755ea7';
const EMAIL_SECRET = 'd8ad54a3-b944-4c2b-9c48-6aa9e2a3d2c9';
const db = require('../db');
const mailjet = require('node-mailjet').apiConnect('d33ae6589f2f475b2121af5637d31823', 'eca0df0aae5d6eb721e8e9452d06b266');


router.post('/sign-up', (req, res) => {
    const {
        name, nickname, email, password, phone, birthday, city_id, job_ids
    } = req.body;

    // Проверка email
    const checkEmailSql = 'SELECT COUNT(*) as count FROM users WHERE email = ?';
    db.query(checkEmailSql, [email], (emailErr, emailResults) => {
        if (emailErr) throw emailErr;

        if (emailResults[0].count > 0) {
            return res.status(400).send({error: 'Email already exists'});
        }
        bcrypt.hash(password, 10, (err, hashedPassword) => {
            if (err) throw err;
            // Вставка пользователя
            const insertUserSql = 'INSERT INTO users (name, nickname, email, password, phone, birthday, city_id) VALUES (?, ?, ?, ?, ?, ?, ?)';
            db.query(insertUserSql, [name, nickname, email, hashedPassword, phone, birthday, city_id], (userErr, userResults) => {
                if (userErr) throw userErr;

                const userId = userResults.insertId;

                // Вставка отношений пользователя с инструментами
                job_ids.forEach(jobId => {
                    const insertJobSql = 'INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)';
                    db.query(insertJobSql, [userId, jobId], (jobErr) => {
                        if (jobErr) throw jobErr;
                    });
                });
                const token = jwt.sign({userId}, EMAIL_SECRET, {expiresIn: '1d'});
                const verificationLink = `http://localhost:4200/#/confirmEmail?code=${token}`;

                // Отправка письма для подтверждения email
                const emailData = {
                    From: {
                        Email: 'info@badum.kz', Name: 'Badum.kz'
                    },
                    To: [{
                        Email: email, name: email
                    }],
                    Subject: 'Подвертдите регистрацию',
                    HTMLPart: `<h3>Зравтсвуйте, ${name}</h3><p>Для завершения регистрации: </p><a href="${verificationLink}">перейдите по ссылке</a>`
                };
                mailjet
                    .post('send', {version: 'v3.1'})
                    .request({Messages: [emailData]})
                    .then(() => {
                        res.status(201).send({message: 'Registration successful. Please check your email to verify.'});
                    })
                    .catch(err => {
                        console.error(err);
                        res.status(500).send({error: 'Server error'});
                    });
            });
        });
    });
});


router.get('/verify-email', async (req, res) => {
    try {
        const {token} = req.query;

        const decoded = jwt.verify(token, EMAIL_SECRET);
        await db.query('UPDATE users SET verified = TRUE WHERE id = ?', [decoded.userId]);

        res.send({message: 'Email verified successfully!'});

    } catch (error) {
        res.status(500).send({message: error.message});
    }
});
router.post('/check-email', (req, res) => {
    const {email} = req.body;

    if (!email) {
        return res.status(400).json({message: 'Email is required.'});
    }

    const sql = 'SELECT COUNT(*) as count FROM users WHERE email = ?';
    db.query(sql, [email], (err, results) => {
        if (err) throw err;

        const isEmailExists = results[0].count > 0;

        res.json({
            emailExists: isEmailExists
        });
    });
});
router.post('/verify-email', (req, res) => {
    const {token} = req.body;

    try {
        const decoded = jwt.verify(token, EMAIL_SECRET);
        const userId = decoded.userId;

        const sql = 'UPDATE users SET status = ? WHERE id = ?';
        db.query(sql, ['active', userId], (err, results) => {
            if (err) throw err;

            if (results.affectedRows > 0) {
                res.json({
                    message: 'Email successfully verified and user activated!'
                });
            } else {
                res.status(404).json({
                    message: 'User not found or already activated.'
                });
            }
        });
    } catch (error) {
        res.status(500).send({message: 'Error verifying email.'});
    }
});

router.post('/sign-in', (req, res) => {
    const {email, password} = req.body;

    const sql = 'SELECT id, password FROM users WHERE email = ? AND status = "active"';
    db.query(sql, [email], (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            return res.status(401).json({message: 'Incorrect email or password1.'});
        }

        const user = results[0];

        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) throw err;

            if (!isMatch) {
                return res.status(401).json({message: 'Incorrect email or password2.'});
            }

            const accessToken = jwt.sign({userId: user.id}, SECRET_KEY, {expiresIn: '999d'});
            const refreshToken = jwt.sign({userId: user.id}, SECRET_KEY2, {expiresIn: '999d'});

            // Здесь можно сохранить refreshToken в базе данных, чтобы в будущем обновлять accessToken.

            res.json({
                accessToken, refreshToken
            });
        });
    });
});
module.exports = router;
