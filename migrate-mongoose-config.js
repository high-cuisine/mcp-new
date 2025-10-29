const { cfg } = require('./dist/libs/common/config/config.service');

module.exports = {
  uri: `mongodb://${cfg.mongo.username}:${cfg.mongo.password}@${cfg.mongo.host}:${cfg.mongo.port}/${cfg.mongo.dbName}`,
  migrationsPath: './migrations',
  templatePath: './migrations/template.js',
  autosync: false
};
