## Modules and Dependency Injection

### Lazy Instantiation of Dependencies
You can check for the existence of a dependency through injector.has, which does not cause 
the dependency to be instantiated. It just checks if there’s either a dependency instance or a provider for it available.

### circular marker `INSTANTIATING`
when get a provider depend on an INSTANTIATING service then a circular dependency chain occurred.

### Provider Constructors
The provider constructor is instantiated right when its registered. 
If some of its dependencies have not been registered yet, it won’t work.
```js
 it('injects another provider to a provider constructor function', function() {
        var module = window.angular.module('myModule', []);
        module.provider('a', function AProvider() {
            var value = 1;
            this.setValue = function(v) { value = v; };
            this.$get = function() { return value; };
        });
        // what inject here is the instantiated `AProvider {setValue: , $get: }`
        module.provider('b', function BProvider(aProvider) {
            aProvider.setValue(2);
            this.$get = function() { };
        });
        var injector = createInjector(['myModule']);
        expect(injector.get('a')).toBe(2);
    });
```

### High-Level Dependency Injection Features
`$provide` only for provider injector
`$injector` can be injected in both provider injector and instance injector

### config blocks
config function run after all provider cached and before any instance cached

### run blocks
The main difference between config blocks and run blocks is that run blocks are injected from the instance cache.

The execution sequence is after all modules loaded.

### value
So basically, a value is implemented with a factory, which in turn is implemented with a provider.
By the looks of it, we could just as well have simply stored the value in the instance cache, as we 
do for constants. But doing it this way allows for decoration - a feature we’ll look at in a few mo-
ments.

### decorator
How it works? Modify the original $get method with the `decoratorFn`,
and in that function `decoratorFn` the original instance got injected as `$delegate`