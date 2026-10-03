// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { register, login, googleLogin, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { validate, registerSchema, loginSchema, googleLoginSchema } = require('../middleware/validate');

router.post('/register', validate(registerSchema), register);
router.post('/login',    validate(loginSchema), login);
router.post('/google',   validate(googleLoginSchema), googleLogin);
router.get('/me',        protect, getMe);

module.exports = router;
