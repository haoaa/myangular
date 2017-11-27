'use strict';

var _ = require('lodash');

var FN_ARGS = /^function\s*[^(]*\(\s*([^)]*)\)/m;
var STRIP_COMMENTS = /(\/\/.*$)|(\/\*.*?\*\/)/mg;
var FN_ARG = /^\s*(_?)(\S+?)\1\s*$/;

function createInjector(moduleToLoad, strictDi) {
    var cache = {};
    var loadedModules = {};
    strictDi = (strictDi === true);

    var $provide = {
        constant : function(key, value) {
            if (key === 'hasOwnProperty') {
                throw 'hasOwnProperty is not a valid constant name!';
            }
            cache[key] = value;
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

    function invoke(fn, self, locals) {
        var args = _.map(annotate(fn), function(token) {
            if (_.isString(token)) {
                return locals && locals.hasOwnProperty(token) ?
                    locals[token] :
                    cache[token];
            }else {
                throw 'Incorrect injection token! Expected a string, got ' + token;
            }
        });
        if (_.isArray(fn)) {
            fn = _.last(fn);
        }
        return fn.apply(self, args);
    }
    _.forEach(moduleToLoad, function loadModule(moduleName) {
        if (!loadedModules.hasOwnProperty(moduleName)) {
            loadedModules[moduleName] =  true;
            var module = window.angular.module(moduleName);
            _.forEach(module.requires, loadModule);
            _.forEach(module._invokeQueue, function(invokeArgs) {
                var method = invokeArgs[0];
                var args = invokeArgs[1];
                $provide[method].apply($provide, args);
            });
        }
    });
    return {
        has : function(key) {
            return cache.hasOwnProperty(key);
        },
        get : function(key) {
            return cache[key];
        },
        annotate : annotate,
        invoke : invoke
    };
}

module.exports = createInjector;