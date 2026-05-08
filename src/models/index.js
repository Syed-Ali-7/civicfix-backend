const { sequelize } = require('../config/db');
const { User, roles } = require('./User');
const { Issue, statuses } = require('./Issue');

User.hasMany(Issue, { foreignKey: 'assigned_to', as: 'assignedIssues' });
User.hasMany(Issue, { foreignKey: 'reporter_id', as: 'reportedIssues' });

module.exports = {
  sequelize,
  User,
  Issue,
  roles,
  statuses,
};

