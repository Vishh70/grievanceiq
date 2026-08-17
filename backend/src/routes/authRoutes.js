// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { register, login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { validate, registerSchema, loginSchema } = require('../middleware/validate');

router.post('/register', validate(registerSchema), register);
router.post('/login',    validate(loginSchema), login);
router.get('/me',        protect, getMe);

module.exports = router;
