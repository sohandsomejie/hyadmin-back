const fs = require('fs');
const path = require('path');

function loadRoutes(dir, router, prefix = '') {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // 递归加载子目录，将目录名添加到前缀
      loadRoutes(fullPath, router, `${prefix}/${file}`);
    } else if (file !== 'index.js' && file.endsWith('.js')) {
      // 加载路由文件，并传递带有前缀的router
      const routeModule = require(fullPath);
      routeModule(router, prefix);
    }
  });
}

module.exports = (router) => {
  loadRoutes(__dirname, router);
};