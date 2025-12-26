export default () => ({
    // If REDIS_HOST is not set:
    // - in development, default to localhost (when app runs on host machine)
    // - in production (e.g. inside docker-compose), default to "redis" service name
    host:
        process.env.REDIS_HOST ||
        (process.env.NODE_ENV === 'production' ? 'redis' : '127.0.0.1'),
    port: process.env.REDIS_PORT || '6379',
    password: process.env.REDIS_PASSWORD,
})