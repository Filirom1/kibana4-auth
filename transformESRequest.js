var _ = require('underscore');
var parse = require('url').parse;

validate.Fail = function () {
  this.message = "Fail" 
};

validate.BadIndex = function (index) {
  validate.Fail.call(this);
  this.message = 'Bad index "' + index + '" in request. ' + this.message;
};

function validate(req) {
  var method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return true;

  var segments = _.compact(parse(req.url).pathname.split('/'));
  var maybeIndex = _.first(segments);
  var maybeMethod = _.last(segments);

  var add = (method === 'POST' || method === 'PUT');
  var rem = (method === 'DELETE');

  // everything below this point assumes a destructive request of some sort
  if (!add && !rem) throw new validate.Fail();

  var bodyStr = String(req.rawBody);
  var jsonBody = bodyStr && parseJson(bodyStr);
  var bulkBody = bodyStr && parseBulk(bodyStr);

  // methods that accept standard json bodies
  var maybeMGet = ('_mget' === maybeMethod && add && jsonBody);
  var maybeSearch = ('_search' === maybeMethod && add && jsonBody);
  var maybeValidate = ('_validate' === maybeMethod && add && jsonBody);

  // methods that accept bulk bodies
  var maybeBulk = ('_bulk' === maybeMethod && add && bulkBody);
  var maybeMsearch = ('_msearch' === maybeMethod && add && bulkBody);

  // indication that this request is against kibana
  var maybeKibanaIndex = maybeIndex.match('.kibana');

  transform()

  return true;

  function transform(){
    if(maybeMsearch || maybeBulk){
      bulkBody.forEach(function(json){
        var query = json.query;
        json.query = {filtered: { query: query, filter: { term: {team: 'admin'} } }}
      });
      req.rawBody = stringifyBulk(bulkBody)
    }
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
      var part = parseJson(parts[i]);
      if (!part) throw new validate.Fail();

      body[i] = part;
    }
    return body;
  }

  function stringifyBulk(body) {
    return body.map(JSON.stringify).join('\n') + '\n';
  }

  function validateNonBulkDestructive() {
    // allow any destructive request against the kibana index
    if (maybeKibanaIndex) return;

    // allow json bodies sent to _mget _search and _validate
    if (jsonBody && (maybeMGet || maybeSearch || maybeValidate)) return;

    // allow bulk bodies sent to _msearch
    if (bulkBody && (maybeMsearch)) return;

    throw new validate.Fail();
  }

  function validateBulkBody(body) {
    while (body.length) {
      var header = body.shift();
      var req = body.shift();

      var op = _.keys(header).join('');
      var meta = header[op];

      if (!meta) throw new validate.Fail();

      var index = meta._index || maybeIndex;
      if (!index.match('.kibana')) {
        throw new validate.BadIndex(index);
      }
    }
  }
}

module.exports = validate;
