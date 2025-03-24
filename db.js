// db.js
const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',           // Тот, что создали/назначили
    password: 'root', // Пароль
    database: 'badum_kz'         // Название вашей БД
});

connection.connect(error => {
    if (error) throw error;
    console.log('Successfully connected to the database.');
});

module.exports = connection;
