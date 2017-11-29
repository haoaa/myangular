'use strict';

var _ = require('lodash');
var HashMap = require('../src/hash_map').HashMap;

var FN_ARGS = /^function\s*[^(]*\(\s*([^)]*)\)/m;
var STRIP_COMMENTS = /(\/\/.*$)|(\/\*.*?\*\/)/mg;
var FN_ARG = /^\s*(_?)(\S+?)\1\s*$/;
var INSTANTIATING = {};

function createInjector(moduleToLoad, strictDi) {
    var providerCache = {_cacheType: "providerCache"},
        instanceCache = {_cacheType: "instanceCache"};

    var providerInjector =
        providerCache.$injector =
        createInternalInjector(providerCache, function() {
            throw 'Unknown provider: ' + path.join(' <- ');
        });

    var instanceInjector =
        instanceCache.$injector =
        createInternalInjector(instanceCache, function(name) {
            var provider = providerInjector.get(name + 'Provider');
            return instanceInjector.invoke(provider.$get, provider);
        });
    var loadedModules = new HashMap();
    var path = []; // dependency chain

    strictDi = (strictDi === true);

    function enforceReturnValue(factoryFn) {
        return function() {
            var value = instanceInjector.invoke(factoryFn);
            if (_.isUndefined(value)) {
                throw 'factory must return a value';
            }
            return value;
        };
    }
    providerCache.$provide = {
        constant : function(key, value) {
            if (key === 'hasOwnProperty') {
                throw 'hasOwnProperty is not a valid constant name!';
            }
            instanceCache[key] = value;
            providerCache[key] = value;
        },
        provider : function(key, provider) {
            if (_.isFunction(provider)) {
                provider = providerInjector.instantiate(provider);
            }
            providerCache[key + 'Provider'] = provider;
        },
        factory : function(key, factoryFn) {
            this.provider(key, {$get: enforceReturnValue(factoryFn)});
        }
    };

    function annotate(fn) {
        if (_.isArray(fn)) {
            return fn.slice(0, -1);
        } else if(fn.$inject) {
            return fn.$inject;
        } else if(fn.length === 0) {
            return [];
        } else {
            if (strictDi) {
                throw 'fn is not using explicit annotation and ' +
                'cannot be invoked in strict mode';
            }
            var source = fn.toString().replace(STRIP_COMMENTS, '');
            var argDeclaration = source.match(FN_ARGS);
            return _.map(argDeclaration[1].split(','), function(argName) {
                return argName.match(FN_ARG)[2];
            });
        }
    }


    function createInternalInjector(cache, factoryFn) {

        function getService(name) {
            if (cache.hasOwnProperty(name)) {
                if (cache[name] === INSTANTIATING) {
                    throw new Error('Circular dependency found: ' +
                        name + ' <- ' + path.join(' <- '));
                }
                return cache[name];
            } else {
                path.unshift(name);
                cache[name] = INSTANTIATING;
                try {
                    return cache[name] = factoryFn(name);
                } finally {
                    path.shift();
                    if (cache[name] === INSTANTIATING) {
                        delete cache[name];
                    }
                }
            }
        }

        function invoke(fn, self, locals) {
            var args = annotate(fn).map(function(token) {
                if (_.isString(token)) {
                    return locals && locals.hasOwnProperty(token) ?
                        locals[token] :
                        getService(token);
                }else {
                    throw 'Incorrect injection token! Expected a string, got ' + token;
                }
            });
            if (_.isArray(fn)) {
                fn = _.last(fn);
            }
            return fn.apply(self, args);
        }

        function instantiate(Type, locals) {
            var UnwrappedType = _.isArray(Type) ? _.last(Type) : Type;
            var instance = Object.create(UnwrappedType.prototype);
            invoke(Type, instance, locals);
            return instance;
        }

        return {
            has : function(name) {
                return cache.hasOwnProperty(name) ||
                    providerCache.hasOwnProperty(name + 'Provider');
            },
            get : getService,
            annotate : annotate,
            invoke : invoke,
            instantiate: instantiate
        };
    }

    function runInvokeQueue(queue) {
        _.forEach(queue, function(invokeArgs) {
            var service = providerInjector.get(invokeArgs[0]); // $provider,$injector
            var method = invokeArgs[1]; // invoke, provider
            var args = invokeArgs[2]; // function, key-value, key-function
            service[method].apply(service, args);
        });
    }
    var runBlocks = [];
    _.forEach(moduleToLoad, function loadModule(module) {
        if (!loadedModules.get(module)) {
            loadedModules.put(module, true);
            if (_.isString(module)) {
                module = window.angular.module(module);
                _.forEach(module.requires, loadModule);
                runInvokeQueue(module._invokeQueue);
                runInvokeQueue(module._configBlocks);
                runBlocks = runBlocks.concat(module._runBlocks);
            }else if(_.isFunction(module) || _.isArray(module)) {
                runBlocks.push(providerInjector.invoke(module));
            }
        }
    });
    _.forEach(_.compact(runBlocks), function(runBlock) {
        instanceInjector.invoke(runBlock);
    });

    return instanceInjector;
}

module.exports = createInjector;
