const { sequelize } = require('../config/db');
const { User, roles } = require('./User');
const { Issue, statuses } = require('./Issue');

module.exports = {
  sequelize,
  User,
  Issue,
  roles,
  statuses,
};

