'use strict';

function $QProvider() {
    function Deferred() {

    }

    function defer() {
        return new Deferred();
    }

    this.$get = function() {

        return {
            defer : defer
        };
    };
}

module.exports = $QProvider;
