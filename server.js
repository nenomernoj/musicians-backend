const express = require('express');
require('dotenv').config();
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const authRoutes = require('./api/authRoutes');
const dicRoutes = require('./api/dicRoutes');
const userRoutes = require('./api/userRoutes');
const uploadRoutes = require('./api/upload');
const uploadGroupRoutes = require('./api/uploadGroup');
const appealsRoutes = require('./api/userAppealsRoutes');
const bandRoutes = require('./api/bandsRoutes');
const path = require('path');

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.get('/', (req, res) => {
    res.send('Hello from Musicians Backend!');
});
app.use('/api/auth', authRoutes);
app.use('/api/directory', dicRoutes);
app.use('/api/user', userRoutes);
app.use('/api/files', uploadRoutes);
app.use('/api/filesBand', uploadGroupRoutes);
app.use('/api/my-appeals', appealsRoutes);
app.use('/api/my-bands', bandRoutes);
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
