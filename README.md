Kibana Multi Tenant.

This is a nodejs reverse proxy for Kibana that create dedicated environment(own config, own dashboard, own saved search, ...) for each subdomains.

You need to patch kibana, 

https://github.com/elastic/kibana/blob/7f60729a304fcdfb60509a2d1da4d13305688954/src/server/lib/validateRequest.js#L43

    -   var maybeKibanaIndex = (maybeIndex === config.kibana.kibana_index);
    +   var maybeKibanaIndex = maybeIndex.match(config.kibana.kibana_index);
