## Modules and Dependency Injection

### Lazy Instantiation of Dependencies
You can check for the existence of a dependency through injector.has, which does not cause 
the dependency to be instantiated. It just checks if there’s either a dependency instance or a provider for it available.

### circular marker `INSTANTIATING`
when get a provider depend on an INSTANTIATING service then a circular dependency chain occurred.