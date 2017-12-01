## promise
### promise chain 
This is how chained then calls work. Each one creates a new Deferred and, by association, a new
Promise. The new Deferred is independent from the original, but is resolved when the original 
one is resolved.