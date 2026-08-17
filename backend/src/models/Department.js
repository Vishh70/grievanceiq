// src/models/Department.js
const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    name:               { type: String, required: true, unique: true, trim: true },
    categoriesHandled:  { type: [String], default: [] },
    contactEmail:       { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Department', departmentSchema);
