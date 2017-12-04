'use strict';

var _ = require('lodash');

function isSuccess(status) {
    return status >= 200 && status < 300;
}

function isBlob(object) {
    return object.toString() === '[object Blob]';
}
function isFile(object) {
    return object.toString() === '[object File]';
}
function isFormData(object) {
    return object.toString() === '[object FormData]';
}

function isJsonLike(data) {
    if (data.match(/^\{(?!\{)/)) {
        return data.match(/\}$/);
    } else if (data.match(/^\[/)) {
        return data.match(/\]$/);
    }
}

function defaultHttpResponseTransform(data, header) {
    if (_.isString(data)) {
        var contentType = header('Content-Type');
        if (contentType && contentType.indexOf('application/json') === 0 ||
            isJsonLike(data)) {
            return JSON.parse(data);
        }
    }
    return data;
}

function $HttpProvider() {

    var defaults = this.defaults = {
        headers : {
            common : {
                'Accept': 'application/json, text/plain, */*'
            },
            post : {
                'Content-Type': 'application/json;charset=utf-8'
            },
            put: {
                'Content-Type': 'application/json;charset=utf-8'
            },
            patch: {
                'Content-Type': 'application/json;charset=utf-8'
            }
        },
        transformRequest : [function(data) {
            if (_.isObject(data) && !isBlob(data) &&
                !isFile(data) && !isFormData(data)) {
                return JSON.stringify(data);
            }else {
                return data;
            }
        }],
        transformResponse : [defaultHttpResponseTransform]
    };

    function executeHeaderFns(header, config) {
        return _.transform(header, function(result, v, k) {
            if (_.isFunction(v)) {
                v = v(config);

                if (_.isNull(v) || _.isUndefined(v)) {
                    delete result[k];
                }else {
                    result[k] = v;
                }
            }
        }, header);
    }

    function mergeHeaders(config) {
        var reqHeaders = _.extend(
            {},
            config.headers
        );
        var defHeaders = _.extend(
            {},
            defaults.headers.common,
            defaults.headers[(config.method || 'get').toLowerCase()]
        );
        _.each(defHeaders, function(value, key) {
            var headerExists = _.some(reqHeaders, function(v, k) {
                return k.toLowerCase() === key.toLowerCase();
            });
            if (!headerExists) {
                reqHeaders[key] = value;
            }
        });
        return executeHeaderFns(reqHeaders, config);
    }

    function parseHeaders(headers) {
        if (_.isObject(headers)) {
            return _.transform(headers, function(result, v, k) {
                result[_.trim(k.toLowerCase())] = _.trim(v);
            }, {});
        } else {
            var lines = headers.split('\n');
            return _.transform(lines, function(result, line) {
                var separatorAt = line.indexOf(':');
                var name = _.trim(line.substring(0, separatorAt).toLowerCase());
                var value = _.trim(line.substring(separatorAt + 1));
                if (name) {
                    result[name] = value;
                }
            }, {});
        }
    }

    function headersGetter(headers) {
        var headersObj;
        return function(name) {
            headersObj = headersObj || parseHeaders(headers);
            if (name) {

                return headersObj[name.toLowerCase()];
            }else {
                return headersObj;
            }
        };
    }

    function transformData(data, headers, status, transfrom) {
        if (_.isFunction(transfrom)) {
            return transfrom(data, headers, status);
        } else {
            return _.reduce(transfrom, function(data, fn) {
                return fn(data, headers, status);
            }, data);
        }
    }

    this.$get = ['$httpBackend', '$q', '$rootScope',  function($httpBackend, $q, $rootScope) {

        function sendReq(config, reqData) {
            var deferred = $q.defer();
            function done(status, response, headersString, statusText) {
                status = Math.max(status, 0);
                deferred[isSuccess(status) ? 'resolve' : 'reject']({
                    status : status,
                    data : response,
                    statusText : statusText,
                    headers : headersGetter(headersString),
                    config : config
                });
                if (!$rootScope.$$phase) {
                    $rootScope.$apply();
                }
            }

            $httpBackend(
                config.method,
                config.url,
                reqData,
                done,
                config.headers,
                config.withCredentials
            );
            return deferred.promise;
        }

        function $http(requestConfig) {

            var config = _.extend({
                method : 'GET',
                transformRequest : defaults.transformRequest,
                transformResponse : defaults.transformResponse
            }, requestConfig);

            config.headers = mergeHeaders(requestConfig);

            if (_.isUndefined(config.withCredentials) &&
                !_.isUndefined(defaults.withCredentials)) {
                config.withCredentials = defaults.withCredentials;
            }

            var reqData = transformData(
                config.data,
                headersGetter(config.headers),
                undefined,
                config.transformRequest
            );

            if (_.isUndefined(reqData)) {
                _.forEach(config.headers, function(v, k) {
                    if (k.toLowerCase() === 'content-type') {
                        delete config.headers[k];
                    }
                });
            }

            function transformResponse(responce) {
                if (responce.data) {
                    responce.data =  transformData(
                        responce.data,
                        responce.headers,
                        responce.status,
                        config.transformResponse
                    );
                }
                if (isSuccess(responce.status)) {
                    return responce;
                } else {
                    return $q.reject(responce);
                }
            }
            return sendReq(config, reqData)
                .then(transformResponse, transformResponse);
        }

        $http.defaults = defaults;
        return $http;
    }];
}
module.exports = $HttpProvider;
