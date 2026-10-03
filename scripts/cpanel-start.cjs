// Keep Next's standalone dependency tree separate from CloudLinux's virtualenv.
process.env.NODE_ENV = 'production';
process.env.HOSTNAME = '0.0.0.0';
require('./runtime/server.js');
