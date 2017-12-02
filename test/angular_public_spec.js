'use strict';

var publishExternalAPI = require('../src/angular_public');
var createInjector = require('../src/injector');

describe('angularPublic', function() {
    beforeEach(function() {
        delete window.angular;
        publishExternalAPI();
    });
    it('sets up the angular object and the module loader', function() {
        expect(window.angular).toBeDefined();
        expect(window.angular.module).toBeDefined();
    });
    it('sets up the ng module', function() {
        expect(createInjector(['ng'])).toBeDefined();
    });
    it('sets up the $filter service', function() {
        var injector = createInjector(['ng']);
        expect(injector.has('$filter')).toBe(true);
    });
    it('sets up the $parse service', function() {
        var injector = createInjector(['ng']);
        expect(injector.has('$parse')).toBe(true);
    });
    it('sets up the $rootScope', function() {
        var injector = createInjector(['ng']);
        expect(injector.has('$rootScope')).toBe(true);
    });
    it('sets up $q', function() {
        publishExternalAPI();
        var injector = createInjector(['ng']);
        expect(injector.has('$q')).toBe(true);
    });
    it('sets up $http and $httpBackend', function() {
        publishExternalAPI();
        var injector = createInjector(['ng']);
        expect(injector.has('$http')).toBe(true);
        expect(injector.has('$httpBackend')).toBe(true);
    });
});
