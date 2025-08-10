const OpenAIApi = require('openai');

module.exports = (router, prefix = '') => {
  router.get(`${prefix}/api/test`, async (ctx) => {
    ctx.body = { message: 'API is working' };
  });
  
};