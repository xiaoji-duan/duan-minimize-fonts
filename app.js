var http = require('http');
var url = require('url');
var fs = require('fs');
var types = require('./mimeTypes');
var Fontmin = require('fontmin');
var URLSafeBase64 = require('urlsafe-base64');

var config = {};

config.routes = new Array();

function statics(ctx) {
  let path = ctx.path();
  
  let filepath = path.slice(4);
  let file = '.' + filepath;
  
  fs.access(file, fs.constants.F_OK | fs.constants.R_OK, (err) => {
    if (err) {
      console.log(
        `${file} ${err.code === 'ENOENT' ? 'does not exist' : 'is read-only'}`);
          console.log("url: " + ctx.request.path);

      let originurl = url.parse(ctx.request.url);
      let regex = '\\/([^\\/\\.]+)\\/[^\\/]+$';
      let matched = path.match(regex);

      let probfontcachecode = null;
      if (matched) probfontcachecode = matched[1]
      if (probfontcachecode && URLSafeBase64.validate(probfontcachecode)) {
        let uri = URLSafeBase64.decode(probfontcachecode).toString();
        let fontcachecode = probfontcachecode;

        if (uri !== undefined && uri.startsWith('/')) {
          buildfont(fontcachecode, {host: 'www.guobaa.com', path: uri, protocol: originurl.protocol, method: ctx.request.method}, {
            success: function() {
              let content = fs.readFileSync(file);
              ctx.response.writeHead(200, {'Content-Type': types.getContentType(filepath)});
              ctx.response.write(content);
              ctx.response.end();
            },
            error: function() {
              ctx.response.writeHead(404, {'Content-Type': 'text/plain'});
              ctx.response.write('file ' + file + ' not exist.');
              ctx.response.end();
            }
          });
        }
      }

    } else {
      let content = fs.readFileSync(file);
      ctx.response.writeHead(200, {'Content-Type': types.getContentType(filepath)});
      ctx.response.write(content);
      ctx.response.end();
    }
  });
}

// 自定义功能代码
config.routes.push({route: '/', handle: index});
config.routes.push({routeRegex: '\\/mif\\/static\\/.+\\..+', handle: statics});
config.routes.push({routeRegex: '\\/mif\\/[a-zA-Z]{3}\\/.*', handle: minfonts});
config.routes.push({routeRegex: '\\/.+', handle: index});

function buildfont(fontcachecode, options, callback) {
  const req = http.request(options, (res) => {
    let body = "";

    res.setEncoding('utf8');
    res.on("data", function(chunk){
      body += chunk;
    });
    res.on('end', () => {
      var reg = /[0-9a-zA-Z\u4e00-\u9fa5]/g;
      var names = body.match(reg);
      var characters = names.join('');
      console.log(names.join(''));
      
      var fontmin = new Fontmin()
          .src('static/xiaoji/fonts/PingFang-Regular.ttf')
          .dest('static/xiaoji/fonts/' + fontcachecode)
          .use(Fontmin.glyph({ 
              text: characters,
              hinting: false         // keep ttf hint info (fpgm, prep, cvt). default = true
          })
          .use(Fontmin.ttf2eot())     // eot 转换插件
          .use(Fontmin.ttf2svg())     // svg 转换插件
          .use(Fontmin.ttf2woff({
              deflate: true           // deflate woff. default = false
          }))    // woff 转换插件
          );
      
      fontmin.run(function (err, files) {
          if (err) {
              if (callback && callback !== undefined) {
                callback.error();
              }
              throw err;
          }

          if (callback && callback !== undefined) {
            callback.success();
          }
          console.log(files[0]);
          // => { contents: <Buffer 00 01 00 ...> }
      });

    });
  });
    
  req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
  });

  req.on('response', () => {
    console.log(`reponsed with request: ${options.path}`);
  });

  req.end();
}

function index(ctx) {
  ctx.response.writeHead(200, {'Content-Type': 'text/plain'});
  ctx.response.end('Minimise webfont CDN service.\n');
}

function minfonts(ctx) {
  let path = ctx.path();
  let uri = path.slice(4);
  let originurl = url.parse(ctx.request.url);
  let fontcachecode = URLSafeBase64.encode(new Buffer(uri));
  
  buildfont(fontcachecode, {host: 'www.guobaa.com', path: uri, protocol: originurl.protocol, method: ctx.request.method});

  ctx.response.writeHead(200, {'Content-Type': 'application/json'});
  ctx.response.end('{"compressed-fonts":"' + fontcachecode + '"}');
}
// 自定义功能代码

// 通用控制代码
function route(routes, path, ctx) {
  let end = routes.length;

  ctx.path = function() {
    return path;
  };
  
  for (let entry in routes) {
    let router = routes[entry];

    console.log(path + ':' + (router.route !== undefined ? router.route : router.routeRegex));
    
    if (router.route !== undefined && typeof router.route === 'string') {
      if (path === router.route) {

      let nextroutes = routes.slice(parseInt(entry) + 1);
        ctx.next = function() {
          route(nextroutes, path, this);
        };
        
        router.handle(ctx);
        break;
      }
    }

    if (router.routeRegex !== undefined && typeof router.routeRegex === 'string') {
      if (path.match(router.routeRegex)) {

        let nextroutes = routes.slice(parseInt(entry) + 1);
        ctx.next = function() {
          route(nextroutes, path, this);
        };

        router.handle(ctx);
        break;
      }
    }
  }
}

http.createServer(function(request, response) {
  
  let ctx = {
    request: request,
    response: response
  };

  let pathname = url.parse(request.url).pathname;
  
  route(config.routes, pathname, ctx);

}).listen(8080);

console.log('Server running at http://127.0.0.1:8080/');  
