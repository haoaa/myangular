'use strict';

function setupModuleLoader(window) {
    var ensure = function(obj, name, factory) {
        return obj[name] || (obj[name] = factory());
    };

    var angular = ensure(window, 'angular', Object);

    function createModule(name, requires, modules, configFn) {
        if (name === 'hasOwnProperty') {
            throw 'hasOwnProperty is not a valid module name';
        }
        var invokeQueue = [];
        var configBlocks = [];

        var invokeLater = function(service, method, arrayMethod, queue) {
            return function() {
                queue = queue || invokeQueue;
                queue[arrayMethod || 'push']([service, method, arguments]);
                return moduleInstance;
            };
        };
        var moduleInstance = {
            name : name,
            requires : requires,
            constant: invokeLater('$provide', 'constant', 'unshift'),
            provider: invokeLater('$provide', 'provider'),
            factory: invokeLater('$provide', 'factory'),
            value: invokeLater('$provide', 'value'),
            service: invokeLater('$provide', 'service'),
            decorator: invokeLater('$provide', 'decorator'),
            filter: invokeLater('$filterProvider', 'register'),
            directive: invokeLater('$compileProvider', 'directive'),
            controller: invokeLater('$controllerProvider', 'register'),
            config: invokeLater('$injector', 'invoke', 'push', configBlocks),
            run: function(fn) {
                moduleInstance._runBlocks.push(fn);
            },
            _invokeQueue: invokeQueue,
            _configBlocks: configBlocks,
            _runBlocks: []
        };

        if (configFn) {
            moduleInstance.config(configFn);
        }

        modules[name] = moduleInstance;
        return moduleInstance;
    }

    function getModule(name, modules) {
        if (modules.hasOwnProperty(name)) {

            return modules[name];
        }else {
            throw  'Module ' + name + ' is not available!';
        }
    }

    ensure(angular, 'module', function() {
        var modules = {};
        return function(name, requires, configFn) {
            if (requires) {
                return createModule(name, requires, modules, configFn);
            }else {
                return getModule(name, modules);
            }
        };
    });
}

module.exports = setupModuleLoader;
