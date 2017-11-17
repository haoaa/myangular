'use strict';

module.exports = function(config) {
    config.set({
        frameworks: ['browserify', 'jasmine'],
        files: [
            'src/**/*.js',
            'test/**/*_spec.js'
        ],
        preprocessors: {
            'test/**/*.js': ['eslint', 'browserify'],
            'src/**/*.js': ['eslint', 'browserify']
        },
        browsers: ['PhantomJS'],
        browserify: {
            debug: true,
            bundleDelay: 2000 // Fixes "reload" error messages, YMMV!
        }
    })
};
