var express = require('express')
var request = require('request')
var _ = require ('underscore')
var url = require('url')
var basicAuth = require('basic-auth-connect');
var transformESRequest = require('./transformESRequest');

var target = url.parse('http://localhost:5601');

function getPort(req) {
  var matches = req.headers.host.match(/:(\d+)/);
  if (matches) return matches[1];
  return req.connection.pair ? '443' : '80';
}

var app = express()

// Authenticator
app.use(basicAuth('admin', 'admin'));

app.get('/config', function (req, res) {
  var matches = req.headers.host.match(/(.*)\./)
  request.get('http://localhost:5601/config', function(err, response, body){
    if(err) return res.send(err);
	var json = JSON.parse(body);
	if(matches) {
	  json.kibana_index = json.kibana_index + '-' + matches[1]
	}
	res.send(JSON.stringify(json))
  });
})

// We need to capture the raw body before moving on
app.use(function (req, res, next) {
  var chunks = [];
  req.on('data', function (chunk) {
    chunks.push(chunk);
  });
  req.on('end', function () {
    req.rawBody = Buffer.concat(chunks);
    next();
  });
});

app.use(function (req, res, next) {
  try {
    transformESRequest(req);
    return next();
  } catch (err) {
    console.error(err)
    res.status(403).send(err.message || 'Bad Request');
  }
});

app.all(/.*/, function (req, res) {
 var uri = _.defaults({}, target);

  // Add a slash to the end of the URL so resolve doesn't remove it.
  var path = (/\/$/.test(uri.path)) ? uri.path : uri.path + '/';
  path = url.resolve(path, '.' + req.url);

  var options = {
    url: uri.protocol + '//' + uri.host + path,
    method: req.method,
    headers: _.defaults({ host: target.hostname }, req.headers),
  }
  
  
  options.headers['x-forward-for'] = req.connection.remoteAddress || req.socket.remoteAddress;
  options.headers['x-forward-port'] = getPort(req);
  options.headers['x-forward-proto'] = req.connection.pair ? 'https' : 'http';
  
  // Only send the body if it's a PATCH, PUT, or POST
  if (req.rawBody) {
    options.headers['content-length'] = req.rawBody.length;
    options.body = req.rawBody.toString('utf8');
  } else {
    options.headers['content-length'] = 0;
  }
  
  options.headers.host = target.host;
  
  var kibanaRequest = request(options);
  kibanaRequest.on('error', function (err) {
    console.error(err);
  });
  kibanaRequest.pipe(res);
});


var server = app.listen(3000, function () {

  var host = server.address().address
  var port = server.address().port

  console.log('Example app listening at http://%s:%s', host, port)

})
