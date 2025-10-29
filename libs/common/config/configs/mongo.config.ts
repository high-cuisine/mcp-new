export default () => ({
    dbName: process.env.MONGODB_DB_NAME || 'mcp',
    username: process.env.MONGODB_USERNAME || 'admin',
    password: process.env.MONGODB_PASSWORD || 'admin',
    host: process.env.MONGODB_HOST || 'localhost',
    port: process.env.MONGODB_PORT || '27017',
});