'use strict';

var _ = require('lodash');

function $QProvider() {

    this.$get = ['$rootScope', function($rootScope) {

        function Promise() {
            this.$$state = {};
        }
        Promise.prototype.then = function(onFulfilled, onRejected) {
            this.$$state.pending = this.$$state.pending || [];
            this.$$state.pending.push([null, onFulfilled, onRejected]);
            if (this.$$state.status > 0) {
                scheduleProcessQueue(this.$$state);
            }
        };
        Promise.prototype.catch = function(onRejected) {
            return this.then(null, onRejected);
        };


        function Deferred() {
            this.promise = new Promise();
        }
        Deferred.prototype.resolve = function(value) {
            if (this.promise.$$state.status) {
                return;
            }
            this.promise.$$state.status = 1;
            this.promise.$$state.value = value;
            scheduleProcessQueue(this.promise.$$state);
        };
        Deferred.prototype.reject = function(value) {
            if (this.promise.$$state.status) {
                return;
            }
            this.promise.$$state.status = 2;
            this.promise.$$state.value = value;
            scheduleProcessQueue(this.promise.$$state);
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
                var fn = handlers[state.status];
                if (_.isFunction(fn)) {
                    fn(state.value);
                }
            });
        }

        function defer() {
            return new Deferred();
        }
        return {
            defer : defer
        };
    }];
}

module.exports = $QProvider;
