// db.js
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Nenomortyr1991#',
    database: 'badum_kz',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// В старом варианте был: const connection = mysql.createConnection(...);
// И connection.connect(...) не нужно вызывать в случае пула — он сам управляет соединениями.

module.exports = pool;
