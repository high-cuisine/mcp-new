import { from } from 'env-var';

const env = from(process.env, {});

export default env;
