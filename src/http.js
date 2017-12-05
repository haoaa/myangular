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

function $HttpParamSerializerProvider() {
    this.$get = function() {
        return function serializeParams(params) {
            var parts = [];
            _.each(params, function(value, key) {
                if (_.isNull(value) || _.isUndefined(value)) {
                    return;
                }

                if (!_.isArray(value)) {
                    value = [value];
                }

                _.each(value, function(v) {
                    if (_.isObject(v)) {
                        v = JSON.stringify(v);
                    }
                    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(v));
                });
            });
            return parts.join('&');
        };
    };
}

function $HttpParamSerializerJQLikeProvider() {
    this.$get = function() {
        return function(params) {
            var parts = [];

            function serialize(value, prefix, topLevel) {
                if (_.isNull(value) || _.isUndefined(value)) {
                    return;
                }
                if (_.isArray(value)) {
                    _.forEach(value, function(v, i) {
                        serialize(v, prefix + '[' + (_.isObject(v) ? i : '') + ']');
                    });
                } else if (_.isObject(value) && !_.isDate(value)) {
                    _.forEach(value, function(v, k) {
                        serialize(v, prefix +
                            (topLevel ? '' : '[') +
                            k +
                            (topLevel ? '' : ']'));
                    });
                } else {
                    parts.push(
                        encodeURIComponent(prefix) + '=' + encodeURIComponent(value));
                }
            }
            serialize(params, '', true);
            return parts.join('&');
        };
    };
}

function buildUrl(url, serializedParams) {
    if (serializedParams.length) {
        url += (url.indexOf('?') === -1) ? '?' : '&';
        url += serializedParams;
    }
    return url;
}
function $HttpProvider() {

    var interceptorFactories = this.interceptors = [];

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
        transformResponse : [defaultHttpResponseTransform],
        paramSerializer : '$httpParamSerializer'
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

    this.$get = ['$httpBackend', '$q', '$rootScope', '$injector', function($httpBackend, $q, $rootScope, $injector) {

        var interceptors = _.map(interceptorFactories, function(fn) {
            return _.isString(fn) ? $injector.get(fn) : $injector.invoke(fn);
        });

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

            var url = buildUrl(config.url, config.paramSerializer(config.params));

            $httpBackend(
                config.method,
                url,
                reqData,
                done,
                config.headers,
                config.withCredentials
            );
            return deferred.promise;
        }

        function serverRequest(config) {

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

        function $http(requestConfig) {

            var config = _.extend({
                method : 'GET',
                transformRequest : defaults.transformRequest,
                transformResponse : defaults.transformResponse,
                paramSerializer : defaults.paramSerializer
            }, requestConfig);

            if (_.isString(config.paramSerializer)) {
                config.paramSerializer = $injector.get(config.paramSerializer);
            }
            config.headers = mergeHeaders(requestConfig);

            var promise = $q.when(config);
            _.each(interceptors, function(interceptor) {
                promise = promise.then(interceptor.request, interceptor.requestError);
            });
            promise = promise.then(serverRequest);
            _.eachRight(interceptors, function(interceptor) {
                promise = promise.then(interceptor.response, interceptor.responseError);
            });
            return promise;
        }

        $http.defaults = defaults;

        _.each(['get', 'head', 'delete'], function(method) {
            $http[method] = function(url, config) {
                return $http(_.extend(config || {}, {
                    url: url,
                    method: method.toUpperCase()
                }));
            };
        });
        _.each(['post', 'put', 'patch'], function(method) {
            $http[method] = function(url, data, config) {
                return $http(_.extend(config || {}, {
                    url : url,
                    data : data,
                    method : method.toUpperCase()
                }));
            };
        });

        return $http;
    }];
}
module.exports = {
    $HttpProvider : $HttpProvider,
    $HttpParamSerializerProvider : $HttpParamSerializerProvider,
    $HttpParamSerializerJQLikeProvider : $HttpParamSerializerJQLikeProvider
};
