const app = require('./app');
const config = require('./config/default');

(async () => {
  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
})();