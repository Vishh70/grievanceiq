// src/middleware/validate.js
const { z } = require('zod');

const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    phone: z.string().optional()
  })
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required')
  })
});

const complaintSchema = z.object({
  body: z.object({
    text: z.string().min(10, 'Complaint description must be at least 10 characters'),
    address: z.string().optional(),
    lat: z.string().optional(),
    lng: z.string().optional(),
  })
});

const validate = (schema) => async (req, res, next) => {
  try {
    await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params
    });
    return next();
  } catch (error) {
    const messages = error.errors || error.issues;
    const msg = Array.isArray(messages) ? messages.map(e => e.message).join(', ') : error.message;
    return res.status(400).json({ error: msg });
  }
};

module.exports = { validate, registerSchema, loginSchema, complaintSchema };
