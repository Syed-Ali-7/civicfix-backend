const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { User } = require('./User');

// SLA TRACKER: Added status states for escalation and citizen feedback flow
const statuses = [
  'Open',
  'Resolved',
  'Escalated',
  'Closed',
  'Reopened',
];

const Issue = sequelize.define(
  'Issue',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    photo_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    resolved_photo_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    latitude: {
      type: DataTypes.DECIMAL(9, 6),
      allowNull: false,
      validate: {
        min: -90,
        max: 90,
      },
    },
    longitude: {
      type: DataTypes.DECIMAL(9, 6),
      allowNull: false,
      validate: {
        min: -180,
        max: 180,
      },
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Perceptual hash of the uploaded image for duplicate/fake detection
    phash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    // Flag to mark issues that require manual review (e.g. when EXIF GPS is missing)
    needs_review: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // AI verification - whether the image contains a pothole
    ai_verified: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    },
    // AI confidence score (0-1)
    ai_confidence: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
      defaultValue: null,
    },
    // AI detection label (pothole, not_pothole, etc.)
    ai_label: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
    },
    status: {
      type: DataTypes.ENUM(...statuses),
      allowNull: false,
      defaultValue: 'Open',
    },
    // SLA TRACKER: AI-determined pothole severity
    severity: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'low',
    },
    // SLA TRACKER: Deadline by which the issue must be resolved
    sla_deadline: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // SLA TRACKER: Whether this issue has been escalated due to SLA breach
    escalated: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // SLA TRACKER: Timestamp when the issue was escalated
    escalated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // SLA TRACKER: Timestamp when the issue was resolved
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Citizen feedback: total number of reopen events
    reopen_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // Citizen feedback: photo uploaded by citizen while rejecting resolution
    rejection_photo_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Citizen feedback: timestamp when citizen confirmed issue is fixed
    confirmed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Citizen feedback: timestamp when citizen rejected a resolved issue
    rejected_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Citizen reference: who reported the issue
    reporter_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    // ESCALATION SYSTEM: currently assigned officer for this issue
    assigned_to: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    // ESCALATION SYSTEM: 1=Level 1, 2=Level 2
    escalation_level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    // ESCALATION SYSTEM: human readable level label
    escalation_label: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'Level 1',
    },
  },
  {
    tableName: 'issues',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
  }
);

Issue.belongsTo(User, {
  foreignKey: 'assigned_to',
  as: 'assignedOfficer',
});

Issue.belongsTo(User, {
  foreignKey: 'reporter_id',
  as: 'reporter',
});

module.exports = {
  Issue,
  statuses,
};
