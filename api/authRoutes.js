const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../db');
const mailjet = require('node-mailjet').apiConnect('d33ae6589f2f475b2121af5637d31823', 'eca0df0aae5d6eb721e8e9452d06b266');
const {OAuth2Client} = require('google-auth-library');
const googleClient = new OAuth2Client();

function generatePassword(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

router.post('/google', async (req, res) => {
    const { token: idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: 'Token required' });

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: '225455252094-4mf9irc3vhpj8mgvdj7di24u9ut9qre6.apps.googleusercontent.com'
        });
        const payload = ticket.getPayload();
        const email = payload.email;
        const name = payload.name;

        const sqlFindUser = 'SELECT id, status FROM users WHERE email = ?';
        db.query(sqlFindUser, [email], (err, results) => {
            if (err) return res.status(500).json({ message: 'DB error' });

            if (results.length > 0) {
                const user = results[0];
                const userId = user.id;

                if (user.status !== '1') {
                    db.query('UPDATE users SET status = "1" WHERE id = ?', [userId], () => {
                        const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '999d' });
                        return res.json({ accessToken: token });
                    });
                } else {
                    const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '999d' });
                    return res.json({ accessToken: token });
                }
            } else {
                const password = generatePassword();
                bcrypt.hash(password, 10, (err, hashedPassword) => {
                    if (err) return res.status(500).json({ message: 'Hash error' });

                    const sqlInsert = `
                        INSERT INTO users (
                          email, name, nickname, password, phone, birthday,
                          city_id, status, avatarId, vk, facebook, instagram
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;

                    const values = [
                        email,
                        name || '',
                        '', // nickname
                        hashedPassword,
                        '', // phone
                        new Date(), // birthday (текущая дата)
                        null, // city_id
                        '0',
                        null, // avatarId
                        '', // vk
                        '', // facebook
                        ''  // instagram
                    ];

                    db.query(sqlInsert, values, (err, result) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({ message: 'Failed to create user' });
                        }
                        const userId = result.insertId;
                        const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '999d' });

                        // Отправка пароля на email
                        const emailData = {
                            From: {
                                Email: 'info@badum.kz',
                                Name: 'Badum.kz'
                            },
                            To: [
                                {
                                    Email: email,
                                    Name: name || email
                                }
                            ],
                            Subject: 'Ваш пароль для входа на badum.kz',
                            HTMLPart: `<h3>Здравствуйте!</h3><p>Вы вошли через Google. Ваш сгенерированный пароль:</p><p><b>${password}</b></p><p>Вы можете изменить его в настройках профиля.</p>`
                        };

                        mailjet.post('send', { version: 'v3.1' }).request({ Messages: [emailData] });

                        return res.json({ accessToken: token });
                    });
                });
            }
        });
    } catch (err) {
        console.error('Google login error:', err);
        res.status(401).json({ message: 'Invalid Google token' });
    }
});
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
                const token = jwt.sign({userId}, process.env.EMAIL_SECRET, {expiresIn: '1d'});
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
        const decoded = jwt.verify(token, process.env.EMAIL_SECRET);
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

    const sql = 'SELECT id, password FROM users WHERE email = ? AND status = "0"';
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

            const accessToken = jwt.sign({userId: user.id}, process.env.JWT_SECRET, {expiresIn: '999d'});
            const refreshToken = jwt.sign({userId: user.id}, process.env.JWT_SECRET2, {expiresIn: '999d'});

            // Здесь можно сохранить refreshToken в базе данных, чтобы в будущем обновлять accessToken.

            res.json({
                accessToken, refreshToken
            });
        });
    });
});
module.exports = router;
