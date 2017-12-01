'use strict';

var _ = require('lodash');

function $QProvider() {

    this.$get = ['$rootScope', function($rootScope) {

        function Promise() {
            this.$$state = {};
        }
        Promise.prototype.then = function(onFulfilled) {
            this.$$state.pending = this.$$state.pending || [];
            this.$$state.pending.push(onFulfilled);
            if (this.$$state.status > 0) {
                scheduleProcessQueue(this.$$state);
            }
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

        function scheduleProcessQueue(state) {
            $rootScope.$evalAsync(function() {
                processQueue(state);
            });
        }
        function processQueue(state) {
            var pending = state.pending;
            state.pending = undefined;
            _.each(pending, function(onFulfilled) {
                onFulfilled(state.value);
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
