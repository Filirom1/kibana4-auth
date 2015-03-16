var _ = require('underscore');
var querystring = require('querystring');
var parse = require('url').parse;

function transform(req) {
  var method = req.method.toUpperCase();
  var read;
  if (method === 'GET' || method === 'HEAD') read=true;
  var urlQuery = querystring.parse(parse(req.url).query).q;

  var pathname = parse(req.url).pathname;

  var segments = _.compact(pathname.split('/'));
  var maybeIndex = _.first(segments);
  var maybeMethod = _.last(segments);

  var add = (method === 'POST' || method === 'PUT');
  var rem = (method === 'DELETE');

  var bodyStr = String(req.rawBody);
  var jsonBody = bodyStr && parseJson(bodyStr);
  var bulkBody = bodyStr && parseBulk(bodyStr);

  // methods that accept bulk bodies
  var maybeBulk = ('_bulk' === maybeMethod && add && bulkBody);
  var maybeMsearch = ('_msearch' === maybeMethod && add && bulkBody);

  // indication that this request is against kibana
  if(maybeIndex){
    var maybeKibanaIndex = maybeIndex.match('.kibana');
    if(maybeKibanaIndex) return;
  }

  req.rawBody = transformBody()
  console.log('>>>>>', req.url, req.rawBody)

  function transformBody(){
    if((maybeMsearch || maybeBulk) && bulkBody){
      console.log(1)
      for (i=0; i<bulkBody.length; i+=2) {
        var header = bulkBody[i];
        var req = bulkBody[i+1];

        var index;
        if(maybeBulk){
          var op = _.keys(header).join('');
          var meta = header[op];

          if (!meta) throw new Error("not meta");

          index = meta._index || maybeIndex;
        }else if(maybeMsearch){
          index = header.index || maybeIndex;
        }
        if(!index.match('.kibana')){
          bulkBody[i+1] = transformQuery(req);
        }
      }
      return stringifyBulk(bulkBody)
    }else if(jsonBody){
      console.log(2)
      return JSON.stringify(transformQuery(jsonBody))
    }else if(urlQuery){
      console.log(3)
      return JSON.stringify(transformQuery({
        query: {
          query_string: {
            query: urlQuery
          }
        }
      }))      
    }else{
      console.log(4)
      return JSON.stringify(transformQuery({
        query: {
          match_all : { }
        }
      }))
    }
  }

  function transformQuery(json){
    var query = json.query;
    if(query){
      json.query = {filtered: { query: query, filter: { term: {team: 'admin'} } }}
    }
    return json
  }

  function parseJson(str) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return;
    }
  }

  function parseBulk(str) {
    var parts = str.split(/\r?\n/);

    var finalLine = parts.pop();
    var evenJsons = (parts.length % 2 === 0);

    if (finalLine !== '' || !evenJsons) return;

    var body = new Array(parts.length);
    for (var i = 0; i < parts.length; i++) {
      var part = JSON.parse(parts[i]);

      body[i] = part;
    }
    return body;
  }

  function stringifyBulk(body) {
    return body.map(JSON.stringify).join('\n') + '\n';
  }
}

module.exports = transform;
