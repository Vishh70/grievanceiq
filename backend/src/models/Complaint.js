// src/models/Complaint.js
const mongoose = require('mongoose');

const statusEntrySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    note:   { type: String, default: '' },
    date:   { type: Date, default: Date.now },
  },
  { _id: false }
);

const complaintSchema = new mongoose.Schema(
  {
    citizenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User',
      required: true,
    },

    // Complaint content
    text:     { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '' },
    imageBase64: { type: String, default: '' },
    location: {
      lat:     { type: Number, default: null },
      lng:     { type: Number, default: null },
      address: { type: String, default: '' },
    },

    // Upvoting & Public Feed
    upvotes: { type: Number, default: 0 },
    upvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // AI outputs
    category:              {
      type:    String,
      enum:    ['Roads', 'Water Supply', 'Electricity', 'Drainage', 'Waste Management', 'Public Infrastructure', 'Other'],
      default: 'Other',
    },
    priority:              {
      type:    String,
      enum:    ['Critical', 'High', 'Medium', 'Low'],
      default: 'Medium',
    },
    embeddingVector:       { type: [Number], default: [] },
    similarGroupId:        { type: String, default: null },
    recommendedDepartment: { type: String, default: '' },
    aiProcessed:           { type: Boolean, default: false },

    // Status tracking
    status: {
      type:    String,
      enum:    ['Submitted', 'In Review', 'In Progress', 'Assigned', 'Resolved', 'Rejected'],
      default: 'Submitted',
    },
    statusHistory: [statusEntrySchema],
  },
  { timestamps: true }
);

// Text index for search
complaintSchema.index({ text: 'text' });
complaintSchema.index({ category: 1, priority: 1 });
complaintSchema.index({ citizenId: 1 });
complaintSchema.index({ similarGroupId: 1 });
complaintSchema.index({ upvotes: -1 });

module.exports = mongoose.model('Complaint', complaintSchema);
