// db.js
const mysql = require('mysql2');
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root', // Замените на ваше имя пользователя
    password: '', // Замените на ваш пароль
    database: 'badum_kz' // Замените на название вашей базы данных
});
connection.connect(error => {
    if (error) throw error;
    console.log('Successfully connected to the database.');
});
module.exports = connection;
