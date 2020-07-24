const mongoose = require('mongoose');
const logger = require('./logger');

module.exports = function (app) {
  const mongodb = app.get('mongodb');
  const password = encodeURIComponent(mongodb.root_password);
  const connectionString = `mongodb://${mongodb.root_user}:${password}@${mongodb.host}:${mongodb.port}/${mongodb.db_name}?authSource=admin`;

  const options = {
    useCreateIndex: true,
    useNewUrlParser: true,
    reconnectInterval: mongodb.reconnect_interval,
    reconnectTries: mongodb.reconnect_tries,
  };

  const connState = {
    isFirstConnection: true,
    reconnectTries: 0
  };

  const gracefullyShutdown = () => {
    mongoose.connection.close(() => {
      console.warn('Received SIGTERM. Closing connection.');
      process.exit(0);
    });
  };

  mongoose.connect(
    connectionString,
    options
  ).catch(err => {});

  const conn = mongoose.connection;

  conn.on('connecting', () => {
    console.info('Connecting...');
  });

  conn.on('connected', () => {
    console.info('Connected.');

    connState.isFirstConnection = false;
    connState.reconnectTries = 0;

    if (process.send) {
      process.send('ready');
    }
  });

  conn.on('open', () => {
    console.log('Connection opened.');
  });

  conn.on('reconnected', () => {
    console.info('Connection reconnected.');
  });

  conn.on('disconnected', () => {
    if (!connState.isFirstConnection) {
      console.error(`Connection lost. Reconnecting in ${mongodb.reconnect_interval/1000} seconds.`);
    }
  });

  conn.on('error', (err) => {
    console.error('Connection error:', err.message);

    if (connState.isFirstConnection) {
      let connInterval = setTimeout(() => {
        conn.openUri(connectionString).catch(err => {});
        connState.reconnectTries += 1;
        console.info(`Reconnecting attempt ${connState.reconnectTries}/${mongodb.reconnect_tries} in ${mongodb.reconnect_interval/1000} seconds.`);

        if (connState.reconnectTries === +mongodb.reconnect_tries) {
          clearInterval(connInterval);
          console.error('Maximum number of reconnections reached.');
          process.exit(1);
        }
      }, mongodb.reconnect_interval);
    }

    mongoose.disconnect();
  });

  process.on('SIGTERM', gracefullyShutdown);
  process.on('SIGINT', gracefullyShutdown);
  process.on('SIGQUIT', gracefullyShutdown);

  mongoose.Promise = global.Promise;

  app.set('mongooseClient', mongoose);
};
