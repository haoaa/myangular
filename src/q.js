'use strict';

var _ = require('lodash');

function $QProvider() {

    this.$get = ['$rootScope', function($rootScope) {

        function Promise() {
            this.$$state = {};
        }
        Promise.prototype.then = function(onFulfilled, onRejected, onProgress) {
            var result = new Deferred();
            this.$$state.pending = this.$$state.pending || [];
            this.$$state.pending.push([result, onFulfilled, onRejected, onProgress]);
            if (this.$$state.status > 0) {
                scheduleProcessQueue(this.$$state);
            }
            return result.promise;
        };
        Promise.prototype.catch = function(onRejected) {
            return this.then(null, onRejected);
        };
        Promise.prototype.finally = function(callback, progressBack) {
            return this.then(function(value) {
                return handleFinallyCallback(callback, value, true);
            }, function(rejection) {
                return handleFinallyCallback(callback, rejection, false);
            }, progressBack);
        };
        function makePromise(value, resolved) {
            var d = new Deferred();
            if (resolved) {
                d.resolve(value);
            }else {
                d.reject(value);
            }
            return d.promise;
        }
        function handleFinallyCallback(callback, value, resolved) {
            var callbackValue = callback();
            if (callbackValue && _.isFunction(callbackValue.then)) {
                return callbackValue.then(function() {
                    return makePromise(value, resolved);
                });
            }else {
                return makePromise(value, resolved);
            }
        }

        function Deferred() {
            this.promise = new Promise();
        }
        Deferred.prototype.resolve = function(value) {
            if (this.promise.$$state.status) {
                return;
            }
            if (value && _.isFunction(value.then)) {
                value.then(
                    _.bind(this.resolve, this),
                    _.bind(this.reject, this),
                    _.bind(this.notify, this)
                );
            } else {
                this.promise.$$state.status = 1;
                this.promise.$$state.value = value;
                scheduleProcessQueue(this.promise.$$state);
            }
        };
        Deferred.prototype.reject = function(value) {
            if (this.promise.$$state.status) {
                return;
            }
            this.promise.$$state.status = 2;
            this.promise.$$state.value = value;
            scheduleProcessQueue(this.promise.$$state);
        };
        Deferred.prototype.notify = function(progress) {
            var pending = this.promise.$$state.pending;
            if (pending && pending.length && !this.promise.$$state.status) {
                $rootScope.$evalAsync(function() {
                    _.each(pending, function(handlers) {
                        var defer = handlers[0];
                        var progressBack = handlers[3];
                        try{
                            defer.notify(_.isFunction(progressBack) ?
                                (progressBack(progress)) :
                                progress
                            );
                        } catch (e) {
                            // console.log(e);
                        }
                    });
                });
            }
        };

        function scheduleProcessQueue(state) {
            $rootScope.$evalAsync(function() {
                processQueue(state);
            });
        }
        function processQueue(state) {
            var pending = state.pending;
            state.pending = undefined;
            _.each(pending, function(handlers) {
                var deferred = handlers[0];
                var fn = handlers[state.status];
                try {
                    if (_.isFunction(fn)) {
                        deferred.resolve(fn(state.value));
                    } else if (state.status === 1) {
                        deferred.resolve(state.value);
                    } else if (state.status === 2) {
                        deferred.reject(state.value);
                    }
                } catch (e) {
                    deferred.reject(e);
                }
            });
        }

        function defer() {
            return new Deferred();
        }

        function reject(rejection) {
            var d = new Deferred();
            d.reject(rejection);
            return d.promise;
        }

        function when(value, callback, errback, progressback) {
            var d = new Deferred();
            d.resolve(value);
            return d.promise.then(callback, errback, progressback);
        }

        return {
            defer : defer,
            reject: reject,
            when : when,
            resolve : when
        };
    }];
}

module.exports = $QProvider;
